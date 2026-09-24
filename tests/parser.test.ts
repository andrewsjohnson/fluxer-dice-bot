import { describe, expect, it } from 'vitest';
import { DiceParseError } from '../src/dice/errors.js';
import { parseDiceExpression, parseD20Input, parseRollInput } from '../src/dice/parser.js';

describe('parseDiceExpression', () => {
  it.each([
    ['d20', { count: 1, sides: 20, modifier: 0 }],
    ['2d6', { count: 2, sides: 6, modifier: 0 }],
    ['2d6+4', { count: 2, sides: 6, modifier: 4 }],
    ['2d6 - 3', { count: 2, sides: 6, modifier: -3 }],
    ['4d6kh3', { count: 4, sides: 6, modifier: 0, keep: { type: 'highest', count: 3 } }],
    ['2d20kl1+7', { count: 2, sides: 20, modifier: 7, keep: { type: 'lowest', count: 1 } }],
    [' 4D6KH3 + 2 ', { count: 4, sides: 6, modifier: 2, keep: { type: 'highest', count: 3 } }],
    ['1d100', { count: 1, sides: 100, modifier: 0 }],
    ['100d10000kh100+100000', { count: 100, sides: 10000, modifier: 100000, keep: { type: 'highest', count: 100 } }],
    ['d2-100000', { count: 1, sides: 2, modifier: -100000 }],
  ])('parses %s', (input, expected) => {
    expect(parseDiceExpression(input)).toEqual(expected);
  });

  it.each([
    ['', 'INVALID_SYNTAX'], ['banana', 'INVALID_SYNTAX'], ['-2d6', 'INVALID_SYNTAX'],
    ['0d6', 'DICE_COUNT_MIN'], ['1d1', 'SIDES_MIN'], ['d0', 'SIDES_MIN'],
    ['101d6', 'DICE_COUNT_MAX'], ['4d6kh5', 'KEEP_MAX'], ['4d6kl0', 'KEEP_MIN'],
    ['d10001', 'SIDES_MAX'], ['d6+100001', 'MODIFIER_RANGE'], ['d6-100001', 'MODIFIER_RANGE'],
    ['d20+1d6', 'INVALID_SYNTAX'], ['2d6+1+2', 'INVALID_SYNTAX'], ['d6*2', 'INVALID_SYNTAX'],
    ['1.5d6', 'INVALID_SYNTAX'], ['d6.5', 'INVALID_SYNTAX'], ['d6+1.5', 'INVALID_SYNTAX'],
    ['d6+1e2', 'INVALID_SYNTAX'], ['d6++2', 'INVALID_SYNTAX'], ['d6--2', 'INVALID_SYNTAX'],
    ['2d6kh1kl1', 'INVALID_SYNTAX'], ['d20kh', 'INVALID_SYNTAX'], ['d20+NaN', 'INVALID_SYNTAX'],
    ['d20 label', 'INVALID_SYNTAX'], ['2 d6', 'INVALID_SYNTAX'], ['d 20', 'INVALID_SYNTAX'],
    ['Ｄ２０', 'INVALID_SYNTAX'], ['d20\u0000', 'INVALID_SYNTAX'],
    [`${'9'.repeat(180)}d6`, 'DICE_COUNT_MAX'],
    [`d${'9'.repeat(180)}`, 'SIDES_MAX'],
    [`d6+${'9'.repeat(180)}`, 'MODIFIER_RANGE'],
    ['d'.repeat(201), 'INPUT_TOO_LONG'],
  ])('rejects %s with %s', (input, code) => {
    expect(() => parseDiceExpression(input)).toThrow(DiceParseError);
    expect(() => parseDiceExpression(input)).toThrow(expect.objectContaining({ code }));
  });
});

describe('roll input and labels', () => {
  it('normalizes only the expression and trims the label', () => {
    expect(parseRollInput('  2D6 + 4   NPC McCloud’s sneak attack  ')).toEqual({
      expression: { count: 2, sides: 6, modifier: 4 }, label: 'NPC McCloud’s sneak attack',
    });
  });

  it('accepts Unicode, labels containing later punctuation, and a 100-character label', () => {
    expect(parseRollInput('d20 Elowen’s résumé + luck').label).toBe('Elowen’s résumé + luck');
    expect(parseRollInput(`d6 ${'x'.repeat(100)}`).label).toHaveLength(100);
  });

  it('rejects oversized labels', () => {
    expect(() => parseRollInput(`d6 ${'x'.repeat(101)}`)).toThrow(expect.objectContaining({ code: 'LABEL_TOO_LONG' }));
  });

  it.each(['d20fireball', 'd20+1d6', 'd20 + 1d6 damage', 'd20 +', 'd20 + potato',
    'd20 + 2 + 3', 'd20 + 2 * 3', 'd20 * 2', 'd20 kh1', '2d6 kl1', 'd20 2d6',
    'd20+2.5 attack', 'd20+2e3 attack', 'd20kh1foo', 'd20kh', 'd20-2damage'])('does not silently accept a partial roll: %s', (input) => {
    expect(() => parseRollInput(input)).toThrow(DiceParseError);
  });
});

describe('advantage/disadvantage input', () => {
  it.each(['highest', 'lowest'] as const)('parses optional modifiers and labels (%s)', (type) => {
    expect(parseD20Input('', type)).toEqual({ expression: { count: 2, sides: 20, modifier: 0, keep: { type, count: 1 } }, label: '' });
    expect(parseD20Input('+ 7 perception', type)).toEqual({ expression: { count: 2, sides: 20, modifier: 7, keep: { type, count: 1 } }, label: 'perception' });
    expect(parseD20Input('-1 stealth', type).expression.modifier).toBe(-1);
    expect(parseD20Input('NPC insight', type).label).toBe('NPC insight');
  });

  it.each(['5', '+', '-foo', '+5foo', '+5.5', '+5+2', '+5 +2', '+1d6', 'd20', '+100001'])('rejects malformed convenience input %s', (input) => {
    expect(() => parseD20Input(input, 'highest')).toThrow(DiceParseError);
  });
});
