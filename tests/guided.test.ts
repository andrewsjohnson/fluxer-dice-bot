import { afterEach, describe, expect, it, vi } from 'vitest';
import { advance, choices, newFlow, prompt } from '../src/guided/flow.js';
import { GuidedRolls, type GuidedMessage } from '../src/guided/sessions.js';
import { diceSequence, testLogger } from './helpers.js';

const run = (inputs: string[]) => {
  const flow = newFlow();
  for (const input of inputs) expect(advance(flow, input).error).toBeUndefined();
  return flow;
};

describe('guided flow', () => {
  it('builds a normal roll and waits for explicit confirmation', () => {
    const flow = run(['d6', '8', 'normal', '+4']);
    expect(flow.state).toEqual({ step: 'confirm', expression: { count: 8, sides: 6, modifier: 4 } });
    expect(advance(flow, 'roll')).toEqual({ action: 'roll' });
  });
  it.each(['advantage', 'disadvantage'])('sets exactly two d20s for %s', (mode) => {
    const flow = run(['20', '5', mode, '-2']);
    expect(flow.state.expression).toEqual({ count: 2, sides: 20, modifier: -2, keep: { type: mode === 'advantage' ? 'highest' : 'lowest', count: 1 } });
    advance(flow, 'back'); advance(flow, 'back');
    expect(flow.state.step).toBe('rules');
    expect(flow.state.expression.count).toBe(5);
  });
  it.each(['highest', 'lowest'])('builds a keep-%s roll', (mode) => {
    const flow = run(['6', '4', mode, '3', 'none']);
    expect(flow.state.expression.keep).toEqual({ type: mode, count: 3 });
    expect(flow.state.step).toBe('confirm');
  });
  it('rejects invalid inputs in place without losing earlier selections', () => {
    const flow = newFlow();
    for (const input of ['1', '10001', '2d6', 'NaN', 'd6.5', 'x'.repeat(201)]) {
      expect(advance(flow, input).error).toBeTruthy();
      expect(flow.state.step).toBe('sides');
    }
    advance(flow, '6');
    expect(advance(flow, '101').error).toBeTruthy();
    advance(flow, '4');
    expect(choices(flow).map(c => c.value)).not.toContain('advantage');
    expect(advance(flow, 'advantage').error).toBeTruthy();
    advance(flow, 'highest');
    for (const input of ['0', '5', '2.5']) expect(advance(flow, input).error).toBeTruthy();
    advance(flow, '3');
    for (const input of ['7', '+100001', '-100001', '+1d6']) expect(advance(flow, input).error).toBeTruthy();
    advance(flow, '-100000');
    expect(advance(flow, 'maybe').error).toBeTruthy();
    expect(prompt(flow).length).toBeLessThan(1900);
  });
  it('goes back and replaces downstream state cleanly', () => {
    const flow = run(['20', '2', 'highest', '1', '+8']);
    for (let i = 0; i < 3; i++) advance(flow, 'back');
    expect(flow.state.step).toBe('rules');
    advance(flow, 'normal'); advance(flow, 'none');
    expect(flow.state.expression).toEqual({ sides: 20, count: 2, modifier: 0 });
    expect(advance(flow, 'cancel').action).toBe('cancel');
  });
});

function setup() {
  const logger = testLogger();
  const rollDie = diceSequence(17, 6);
  const guided = new GuidedRolls(logger, { rollDie });
  let id = 0;
  const messages: ReturnType<typeof makePrompt>[] = [];
  function makePrompt() {
    return { id: `prompt-${++id}`, edit: vi.fn().mockResolvedValue(undefined), react: vi.fn().mockResolvedValue(undefined), removeReaction: vi.fn().mockResolvedValue(undefined) };
  }
  const reply = vi.fn(async () => { const message = makePrompt(); messages.push(message); return message; });
  const incoming = (content: string, overrides: Partial<GuidedMessage> = {}): GuidedMessage => ({
    content, channelId: 'channel', author: { id: 'user', bot: false }, messageReference: null, reply, ...overrides,
  });
  const answer = (text: string) => guided.handleMessage(incoming(text, { messageReference: { messageId: messages.at(-1)!.id } }));
  const react = (name: string, userId = 'user', messageId = messages.at(-1)!.id) => guided.handleReaction({
    channelId: 'channel', userId, messageId, emoji: { name }, user: { bot: false },
  });
  return { guided, logger, rollDie, reply, incoming, answer, react, messages };
}

afterEach(() => vi.useRealTimers());

describe('guided sessions', () => {
  it('completes a reaction/reply conversation in one message and rolls exactly once', async () => {
    const s = setup();
    await s.guided.handleMessage(s.incoming('!ROLL'));
    await s.react('6️⃣'); // d20
    await s.react('☝'); // one, variation selector optional
    await s.react('⬆️'); // advantage overrides count
    await s.answer('+8');
    expect(s.rollDie).not.toHaveBeenCalled();
    await Promise.all([s.react('🎲'), s.react('🎲')]);
    expect(s.rollDie).toHaveBeenCalledTimes(2);
    expect(s.reply).toHaveBeenCalledTimes(1);
    expect(s.messages[0]!.edit).toHaveBeenLastCalledWith(expect.objectContaining({ content: expect.stringContaining('Total: **25**') }));
    expect(s.messages[0]!.edit.mock.calls.at(-1)![0].content).toContain('`!r 2d20kh1 + 8`');
    expect(s.guided.size).toBe(0);
  });
  it('ignores other users, bots, other messages, and unrelated conversation', async () => {
    const s = setup(); await s.guided.handleMessage(s.incoming('!roll'));
    const edits = s.messages[0]!.edit.mock.calls.length;
    await s.react('1️⃣', 'intruder'); await s.react('1️⃣', 'user', 'other-message');
    await s.guided.handleReaction({ channelId: 'channel', userId: 'user', messageId: s.messages[0]!.id, emoji: { name: '1️⃣' }, user: { bot: true } });
    expect(await s.guided.handleMessage(s.incoming('20'))).toBe(false);
    expect(await s.guided.handleMessage(s.incoming('20', { author: { id: 'intruder', bot: false }, messageReference: { messageId: s.messages[0]!.id } }))).toBe(false);
    expect(s.messages[0]!.edit).toHaveBeenCalledTimes(edits);
    s.guided.dispose();
  });
  it('keeps ordinary complete commands on the immediate path', async () => {
    const s = setup(); await s.guided.handleMessage(s.incoming('!r'));
    expect(await s.answer('!r d20')).toBe(false);
    expect(await s.guided.handleMessage(s.incoming('!help'))).toBe(false);
    s.guided.dispose();
  });
  it('supports independent users/channels and replaces only the same user’s session', async () => {
    const s = setup(); await s.guided.handleMessage(s.incoming('!r'));
    await s.guided.handleMessage(s.incoming('!r', { channelId: 'other' }));
    await s.guided.handleMessage(s.incoming('!r', { author: { id: 'other-user', bot: false } }));
    expect(s.guided.size).toBe(3);
    await s.guided.handleMessage(s.incoming('!r'));
    expect(s.guided.size).toBe(3);
    expect(s.messages[0]!.edit.mock.calls.at(-1)![0].content).toContain('new guided roll');
    s.guided.dispose();
  });
  it('expires after inactivity and resets the timeout for owner input', async () => {
    vi.useFakeTimers();
    const s = setup(); await s.guided.handleMessage(s.incoming('!r'));
    await vi.advanceTimersByTimeAsync(119000); await s.answer('d6');
    await vi.advanceTimersByTimeAsync(119000); expect(s.guided.size).toBe(1);
    await vi.advanceTimersByTimeAsync(1000); expect(s.guided.size).toBe(0);
    expect(s.messages[0]!.edit.mock.calls.at(-1)![0].content).toContain('expired');
    await s.react('🎲'); expect(s.rollDie).not.toHaveBeenCalled();
  });
  it('cancels, handles deleted prompts, and clears timers on shutdown', async () => {
    vi.useFakeTimers();
    const s = setup(); await s.guided.handleMessage(s.incoming('!r')); await s.answer('cancel');
    expect(s.guided.size).toBe(0);
    await s.guided.handleMessage(s.incoming('!r')); s.guided.removePrompt(s.messages.at(-1)!.id);
    expect(s.guided.size).toBe(0);
    await s.guided.handleMessage(s.incoming('!r')); s.guided.dispose();
    expect(s.guided.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('still works with text if adding reactions is forbidden', async () => {
    const s = setup();
    s.reply.mockImplementationOnce(async () => {
      const p = { id: 'no-reactions', edit: vi.fn().mockResolvedValue(undefined), react: vi.fn().mockRejectedValue(new Error('secret')), removeReaction: vi.fn().mockResolvedValue(undefined) };
      s.messages.push(p); return p;
    });
    await s.guided.handleMessage(s.incoming('!roll'));
    for (const text of ['d20', '1', 'normal', 'none', 'roll']) await s.answer(text);
    expect(s.rollDie).toHaveBeenCalledTimes(1);
    expect(s.guided.size).toBe(0);
    expect(JSON.stringify(s.logger.warn.mock.calls)).not.toContain('secret');
  });
  it('contains send/edit failures and bounds simultaneous sessions', async () => {
    const s = setup(); s.reply.mockRejectedValueOnce(new Error('private-token'));
    await s.guided.handleMessage(s.incoming('!r')); expect(s.guided.size).toBe(0);
    await s.guided.handleMessage(s.incoming('!r'));
    s.messages[0]!.edit.mockRejectedValueOnce(new Error('private-token'));
    await s.answer('d20'); expect(s.guided.size).toBe(0);
    const bounded = new GuidedRolls(s.logger, {}, 120000, 1);
    await bounded.handleMessage(s.incoming('!roll'));
    await bounded.handleMessage(s.incoming('!roll', { channelId: 'other' }));
    expect(bounded.size).toBe(1);
    expect(s.reply.mock.calls.at(-1)).toEqual([expect.objectContaining({ content: expect.stringContaining('busy') })]);
    bounded.dispose();
  });
});

describe('guided asynchronous boundaries', () => {
  it('does not resurrect an expired session when a slow prompt send finishes', async () => {
    vi.useFakeTimers(); const s = setup();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const p = { id: 'slow', edit: vi.fn().mockResolvedValue(undefined), react: vi.fn().mockResolvedValue(undefined), removeReaction: vi.fn().mockResolvedValue(undefined) };
    s.reply.mockImplementationOnce(async () => { await gate; return p; });
    const starting = s.guided.handleMessage(s.incoming('!roll'));
    await vi.advanceTimersByTimeAsync(120000);
    expect(s.guided.size).toBe(0);
    release(); await starting; await vi.advanceTimersByTimeAsync(0);
    expect(p.react).not.toHaveBeenCalled();
    expect(p.edit).toHaveBeenLastCalledWith(expect.objectContaining({ content: expect.stringContaining('expired') }));
  });
  it('does not treat stale die-choice reactions as answers to later questions', async () => {
    const s = setup(); await s.guided.handleMessage(s.incoming('!roll')); await s.react('6️⃣');
    const edits = s.messages[0]!.edit.mock.calls.length;
    await s.react('6️⃣');
    expect(s.messages[0]!.edit).toHaveBeenCalledTimes(edits);
    s.guided.dispose();
  });
});
