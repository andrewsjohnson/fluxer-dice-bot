import { advantage } from '../commands/advantage.js';
import { disadvantage } from '../commands/disadvantage.js';
import { help } from '../commands/help.js';
import { roll } from '../commands/roll.js';
import { DiceParseError } from '../dice/errors.js';
import { formatError, formatUnexpectedError } from '../dice/formatter.js';
import { checkInputLength } from '../dice/parser.js';
import type { RollOptions } from '../dice/types.js';
import type { Logger } from '../logger.js';

export type CommandName = 'roll' | 'advantage' | 'disadvantage' | 'help';
const COMMANDS: Record<string, CommandName> = { r: 'roll', roll: 'roll', adv: 'advantage', dis: 'disadvantage', help: 'help' };
const PREFIX = /^!(r|roll|adv|dis|help)(?=\s|$)/i;

export function commandName(content: string): CommandName | undefined {
  const match = PREFIX.exec(content);
  return match?.[1] ? COMMANDS[match[1].toLowerCase()] : undefined;
}

/** Platform-independent command execution, including friendly validation errors. */
export function routeCommand(content: string, options: RollOptions = {}): string | null {
  const command = commandName(content);
  if (!command) return null;
  try {
    checkInputLength(content);
    const input = content.slice(content.search(/\s|$/)).trim();
    switch (command) {
      case 'roll': return roll(input, options);
      case 'advantage': return advantage(input, options);
      case 'disadvantage': return disadvantage(input, options);
      case 'help': return help();
    }
  } catch (error) {
    if (error instanceof DiceParseError) return formatError(error);
    throw error;
  }
}

export type ReplyPayload = {
  content: string;
  allowedMentions: { parse: []; users: []; roles: []; repliedUser: false };
};

export type IncomingMessage = {
  author: { bot: boolean };
  content: string;
  reply: (payload: ReplyPayload) => Promise<unknown>;
};

export async function handleMessage(message: IncomingMessage, logger: Logger, options: RollOptions = {}): Promise<void> {
  if (message.author.bot) return;
  const command = commandName(message.content);
  if (!command) return;

  let content: string | null;
  try {
    content = routeCommand(message.content, options);
  } catch {
    logger.error('command_failed', { command });
    content = formatUnexpectedError();
  }
  if (content === null) return;

  // Exactly one reply attempt. A failed send must not cause a second reply/loop.
  try {
    await message.reply({ content, allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } });
  } catch {
    logger.error('reply_failed', { command });
  }
}
