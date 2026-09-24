import { describe, expect, it } from 'vitest';
import { DiceParseError } from '../src/dice/errors.js';
import { evaluate } from '../src/dice/evaluator.js';
import { formatError, formatExpression, formatHelp, formatLabel, formatRoll } from '../src/dice/formatter.js';
import { LIMITS } from '../src/dice/limits.js';
import { parseDiceExpression } from '../src/dice/parser.js';
import { diceSequence } from './helpers.js';

describe('formatRoll', () => {
  it('shows original order, dropped dice, modifier and total', () => {
    const result = evaluate(parseDiceExpression('2d20kh1+8'), { rollDie: diceSequence(17, 5) });
    expect(formatRoll(result, 'Attack Roll')).toBe('🎲 Attack Roll\n2d20kh1 + 8\nRolls: [17, ~~5~~] + 8\nTotal: **25**');
  });

  it('uses a readable no-label heading and avoids + -2', () => {
    const result = evaluate(parseDiceExpression('d20-2'), { rollDie: () => 14 });
    expect(formatRoll(result)).toBe('🎲 Dice Roll\nd20 - 2\nRoll: 14 - 2\nTotal: **12**');
  });

  it.each([1, 20])('bolds and calls out natural %s', (natural) => {
    const result = evaluate(parseDiceExpression('d20+7'), { rollDie: () => natural });
    const output = formatRoll(result, 'Attack');
    expect(output).toContain(`Roll: **${natural}** + 7`);
    expect(output).toContain(`**Natural ${natural}!**`);
    expect(output).toContain(`Total: **${natural + 7}**`);
    expect(output).not.toMatch(/success|failure|critical/i);
  });

  it('does not highlight a dropped natural', () => {
    const result = evaluate(parseDiceExpression('2d20kl1'), { rollDie: diceSequence(20, 8) });
    expect(formatRoll(result)).toContain('[~~20~~, 8]');
    expect(formatRoll(result)).not.toContain('Natural');
  });

  it('adds convenience command headings', () => {
    const result = evaluate(parseDiceExpression('2d20kh1'), { rollDie: diceSequence(17, 5) });
    expect(formatRoll(result, 'NPC Insight', 'advantage')).toContain('🎲 Advantage — NPC Insight');
    expect(formatRoll(result, '', 'disadvantage')).toContain('🎲 Disadvantage\n');
  });

  it('summarizes large rolls without pretending preview values are all the dice', () => {
    const result = evaluate(parseDiceExpression('100d10000kh1+100000'), { rollDie: () => 10000 });
    const output = formatRoll(result, '*'.repeat(100));
    expect(output.length).toBeLessThan(LIMITS.responseLength);
    expect(output).toContain('First 20 of 100 rolls:');
    expect(output).toContain('Kept 1; dropped 99. Subtotal: 10000 + 100000');
    expect(output).toContain('Total: **110000**');
    expect(output).toContain('~~10000~~');
  });

  it('shows full detail for 20 dice and summarizes 21 or more', () => {
    expect(formatRoll(evaluate(parseDiceExpression('20d6'), { rollDie: () => 1 }))).not.toContain('First');
    expect(formatRoll(evaluate(parseDiceExpression('21d6'), { rollDie: () => 1 }))).toContain('First 20 of 21');
  });
});

describe('safe labels and shared formatting', () => {
  it('preserves names, Unicode and acronyms', () => {
    expect(formatLabel('  NPC McCloud’s DEX résumé  ')).toBe('NPC McCloud’s DEX résumé');
  });

  it('escapes markdown and neutralizes mentions and control characters', () => {
    const label = formatLabel('**hit** ~~miss~~ [x](https://evil.test) <@123> @everyone\nTotal:\u202e\u0000');
    expect(label).toContain('\\*\\*hit\\*\\*');
    expect(label).toContain('\\~\\~miss\\~\\~');
    expect(label).toContain('\\[x\\]\\(');
    expect(label).not.toContain('<@123>');
    expect(label).not.toContain('@everyone');
    expect(label).not.toMatch(/[\n\u202e\u0000]/);
    expect(formatLabel('\ud800')).toBe('\ufffd');
  });

  it('normalizes casing/count and omits zero modifiers', () => {
    expect(formatExpression(parseDiceExpression('01D20 +0'))).toBe('d20');
  });

  it('formats categorized errors without raw input', () => {
    expect(formatError(new DiceParseError('KEEP_MAX', { count: 4, keep: 7 }))).toContain("can't keep 7 dice when only 4");
    expect(formatError(new DiceParseError('KEEP_MAX', { count: 4, keep: 1e100 }))).not.toContain('1e');
    expect(formatError(new DiceParseError('INVALID_SYNTAX'))).toContain('`!r d20`');
  });

  it('keeps help concise and includes every command family', () => {
    const output = formatHelp();
    for (const command of ['!r ', '!roll', '!adv', '!dis']) expect(output).toContain(command);
    expect(output.length).toBeLessThan(1000);
  });
});
