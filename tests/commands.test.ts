import { describe, expect, it, vi } from 'vitest';
import { handleMessage, routeCommand } from '../src/fluxer/command-router.js';
import { diceSequence, testLogger } from './helpers.js';

describe('commands', () => {
  it.each([
    ['!r d20', [14], '**14**'],
    ['!roll d20', [14], '**14**'],
    ['!r 2d6 + 4 sneak attack', [2, 5], '**11**'],
    ['!r d20-2', [1], '**-1**'],
    ['!r 4d6kh3 ability score', [6, 2, 4, 1], '**12**'],
    ['!adv', [17, 6], '**17**'],
    ['!adv +5', [17, 6], '**22**'],
    ['!adv + 5 perception', [17, 6], '**22**'],
    ['!dis', [18, 7], '**7**'],
    ['!dis -1', [18, 7], '**6**'],
    ['!dis +3 stealth', [18, 7], '**10**'],
    ['!ADV insight', [17, 6], '**17**'],
    ['!RoLl\t2D20KL1 + 2 DEX save', [18, 7], '**9**'],
  ])('routes %s', (message, values, total) => {
    expect(routeCommand(message, { rollDie: diceSequence(...values) })).toContain(`Total: ${total}`);
  });

  it('preserves labels for normal and convenience rolls', () => {
    for (const input of ['!r d20 NPC Insight', '!adv NPC Insight', '!dis -1 NPC Insight']) {
      expect(routeCommand(input, { rollDie: () => 10 })).toContain('NPC Insight');
    }
  });

  it('help never rolls dice', () => {
    const rollDie = vi.fn(() => 1);
    expect(routeCommand('!HELP', { rollDie })).toContain('Dice Roller');
    expect(rollDie).not.toHaveBeenCalled();
  });

  it.each(['hello', 'please !r d20', ' !r d20', '!random d20', '!rollover d20', '!r2d6', '!advantage', '!helpful', '!!r d20', '!r\u0000d20'])('ignores unrelated or unsupported messages: %s', (input) => {
    expect(routeCommand(input)).toBeNull();
  });

  it.each(['!r', '!roll potato', '!r 2000d6', '!r 4d6kh7', '!r d1', '!adv 5', '!dis +3.5'])('returns a friendly error for %s without rolling', (input) => {
    const rollDie = vi.fn(() => 1);
    expect(routeCommand(input, { rollDie })).toMatch(/^❌ /);
    expect(rollDie).not.toHaveBeenCalled();
  });

  it('enforces the full command length before parsing, including on help', () => {
    const rollDie = vi.fn(() => 1);
    expect(routeCommand(`!r ${' '.repeat(194)}d20`, { rollDie })).toContain('Total'); // exactly 200
    expect(routeCommand(`!r ${' '.repeat(195)}d20`, { rollDie })).toContain('200 characters');
    expect(routeCommand(`!help ${'x'.repeat(195)}`)).toContain('200 characters');
    expect(rollDie).toHaveBeenCalledTimes(1);
    expect(routeCommand('unrelated '.repeat(10000))).toBeNull();
  });

  it('safely handles malformed Unicode without leaking it into errors', () => {
    expect(routeCommand('!r \ud800')).toMatch(/^❌ /);
    expect(routeCommand('!r d20 \ud800', { rollDie: () => 2 })).toContain('\ufffd');
  });
});

describe('message boundary', () => {
  it('ignores bots and unrelated messages', async () => {
    const reply = vi.fn();
    const logger = testLogger();
    await handleMessage({ author: { bot: true }, content: '!r d20', reply }, logger);
    await handleMessage({ author: { bot: false }, content: 'hello', reply }, logger);
    expect(reply).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('replies exactly once with every kind of mention disabled', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    await handleMessage({ author: { bot: false }, content: '!r d20 @everyone <@123>', reply }, testLogger(), { rollDie: () => 14 });
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith({
      content: expect.stringContaining('Total: **14**'),
      allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
    });
    expect(reply.mock.calls[0]?.[0].content).not.toContain('@everyone');
  });

  it('replies once to validation errors without logging user content', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const logger = testLogger();
    await handleMessage({ author: { bot: false }, content: '!r potato secret', reply }, logger);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0].content).not.toContain('secret');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('contains unexpected evaluation exceptions and logs only a fixed category', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const logger = testLogger();
    await handleMessage({ author: { bot: false }, content: '!r d20 secret label', reply }, logger, {
      rollDie: () => { throw new Error('token-and-private-message'); },
    });
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0].content).toContain('Something went wrong');
    expect(logger.error).toHaveBeenCalledExactlyOnceWith('command_failed', { command: 'roll' });
    expect(JSON.stringify(reply.mock.calls)).not.toContain('token-and-private-message');
  });

  it('contains send failures without retrying the message', async () => {
    const reply = vi.fn().mockRejectedValue(new Error('Authorization: secret-token'));
    const logger = testLogger();
    await expect(handleMessage({ author: { bot: false }, content: '!help', reply }, logger)).resolves.toBeUndefined();
    expect(reply).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledExactlyOnceWith('reply_failed', { command: 'help' });
  });
});
