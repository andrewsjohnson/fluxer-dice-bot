import { evaluate } from '../dice/evaluator.js';
import { formatExpression, formatRoll } from '../dice/formatter.js';
import type { RollOptions } from '../dice/types.js';
import { commandName, type ReplyPayload } from '../fluxer/command-router.js';
import type { Logger } from '../logger.js';
import { advance, choices, newFlow, prompt, type Flow } from './flow.js';

export const safeMessage = (content: string): ReplyPayload => ({ content, allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } });
export type PromptMessage = {
  id: string;
  edit(payload: ReplyPayload): Promise<unknown>;
  react(emoji: string): Promise<unknown>;
  removeReaction(emoji: string): Promise<unknown>;
};
export type GuidedMessage = {
  channelId: string;
  content: string;
  author: { id: string; bot: boolean };
  messageReference: { messageId: string } | null;
  reply(payload: ReplyPayload): Promise<PromptMessage>;
};
export type GuidedReaction = { channelId: string; messageId: string; userId: string; emoji: { name: string; id?: string }; user: { bot: boolean } };
type Session = {
  key: string; flow: Flow; message?: PromptMessage; closed: boolean; busy: boolean;
  reactions: string[]; timer?: ReturnType<typeof setTimeout>; work: Promise<void>;
};
const normalizeEmoji = (emoji: string) => emoji.replace(/\ufe0f/g, '');

/** Bounded, short-lived state only. No gateway history or incoming text is stored. */
export class GuidedRolls {
  private readonly sessions = new Map<string, Session>();
  constructor(private readonly logger: Logger, private readonly options: RollOptions = {}, private readonly timeout = 120_000, private readonly capacity = 100) {}
  get size(): number { return this.sessions.size; }

  private drop(session: Session): void {
    session.closed = true;
    if (session.timer) clearTimeout(session.timer);
    if (this.sessions.get(session.key) === session) this.sessions.delete(session.key);
  }
  private async close(session: Session, content: string): Promise<void> {
    this.drop(session);
    await session.work;
    try { await session.message?.edit(safeMessage(content)); }
    catch { this.logger.warn('guided_update_failed'); }
  }
  private arm(session: Session): void {
    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(() => { void this.close(session, '⌛ This roll expired. Type `!roll` to start again.'); }, this.timeout);
    session.timer.unref();
  }
  private async render(session: Session, error = ''): Promise<void> {
    if (session.closed || !session.message) return;
    await session.message.edit(safeMessage(prompt(session.flow, error)));
    const next = choices(session.flow).map(c => c.emoji);
    // Only remove the bot's own reactions; no Manage Messages permission needed.
    for (const emoji of session.reactions.filter(e => !next.includes(e))) {
      try { await session.message.removeReaction(emoji); } catch { /* Text remains usable. */ }
    }
    for (const emoji of next.filter(e => !session.reactions.includes(e))) {
      if (session.closed) return;
      try { await session.message.react(emoji); }
      catch { this.logger.warn('guided_reaction_failed'); break; }
    }
    session.reactions = next;
  }
  private async answer(session: Session, input: string): Promise<void> {
    // Ignore rapid duplicate inputs while editing; never queue an unbounded backlog.
    if (session.closed || session.busy) return;
    session.busy = true;
    this.arm(session);
    session.work = (async () => {
      try {
        const result = advance(session.flow, input);
        if (result.action === 'cancel') {
          this.drop(session);
          await session.message?.edit(safeMessage('Roll cancelled. Type `!roll` to start again.'));
        } else if (result.action === 'roll') {
          this.drop(session); // Claim completion before any network request or second click.
          const rolled = evaluate(session.flow.state.expression, this.options);
          await session.message?.edit(safeMessage(`${formatRoll(rolled)}\nNext time: \`!r ${formatExpression(rolled.expression)}\``));
        } else await this.render(session, result.error);
      } catch {
        this.logger.error('guided_update_failed');
        this.drop(session);
        try { await session.message?.edit(safeMessage('❌ This guided roll could not finish. Type `!roll` to try again.')); } catch { /* Already logged. */ }
      } finally { session.busy = false; }
    })();
    await session.work;
  }
  async handleMessage(message: GuidedMessage): Promise<boolean> {
    if (message.author.bot) return false;
    const key = `${message.channelId}:${message.author.id}`;
    const previous = this.sessions.get(key);
    if (/^!(?:r|roll)\s*$/i.test(message.content) && message.content.length <= 200) {
      if (previous) await this.close(previous, 'A new guided roll was started. Use the latest prompt.');
      // Another concurrent start may have won while the old prompt was closing.
      if (this.sessions.has(key)) return true;
      if (this.sessions.size >= this.capacity) {
        await message.reply(safeMessage('Guided rolls are busy. Try again shortly, or use `!r d20` directly.'));
        return true;
      }
      const session: Session = { key, flow: newFlow(), closed: false, busy: true, reactions: [], work: Promise.resolve() };
      this.sessions.set(key, session);
      this.arm(session);
      session.work = (async () => {
        try {
          session.message = await message.reply(safeMessage(prompt(session.flow)));
          await this.render(session);
        } catch { this.logger.error('guided_update_failed'); this.drop(session); }
        finally { session.busy = false; }
      })();
      await session.work;
      return true;
    }
    if (commandName(message.content)) return false;
    if (previous?.message && message.messageReference?.messageId === previous.message.id) {
      await this.answer(previous, message.content);
      return true;
    }
    return false;
  }
  async handleReaction(event: GuidedReaction): Promise<void> {
    if (event.user.bot || event.emoji.id) return;
    const session = this.sessions.get(`${event.channelId}:${event.userId}`);
    if (!session?.message || session.message.id !== event.messageId) return;
    const choice = choices(session.flow).find(c => normalizeEmoji(c.emoji) === normalizeEmoji(event.emoji.name));
    if (choice) await this.answer(session, choice.value);
  }
  removePrompt(messageId: string): void {
    for (const session of this.sessions.values()) if (session.message?.id === messageId) this.drop(session);
  }
  dispose(): void { for (const session of this.sessions.values()) this.drop(session); }
}
