import { describe, expect, it, vi } from 'vitest';
import { evaluate } from '../src/dice/evaluator.js';
import { parseDiceExpression } from '../src/dice/parser.js';
import { diceSequence } from './helpers.js';

describe('evaluate', () => {
  it('rolls once per die and applies positive modifiers', () => {
    const rollDie = diceSequence(2, 5);
    const result = evaluate(parseDiceExpression('2d6+4'), { rollDie });
    expect(rollDie).toHaveBeenCalledTimes(2);
    expect(rollDie).toHaveBeenNthCalledWith(1, 6);
    expect(result).toMatchObject({ dice: [{ value: 2, kept: true }, { value: 5, kept: true }], subtotal: 7, modifier: 4, total: 11 });
  });

  it('allows negative totals and negative modifiers', () => {
    expect(evaluate(parseDiceExpression('d6-10'), { rollDie: () => 1 })).toMatchObject({ subtotal: 1, modifier: -10, total: -9 });
  });

  it.each([
    ['4d6kh3+2', [true, true, true, false], 12, 14],
    ['4d6kl2-1', [false, true, false, true], 3, 2],
  ])('keeps the correct dice without changing presentation order (%s)', (text, kept, subtotal, total) => {
    const result = evaluate(parseDiceExpression(text), { rollDie: diceSequence(6, 2, 4, 1) });
    expect(result.dice.map((d) => d.value)).toEqual([6, 2, 4, 1]);
    expect(result.dice.map((d) => d.kept)).toEqual(kept);
    expect(result.subtotal).toBe(subtotal);
    expect(result.total).toBe(total);
  });

  it.each(['4d6kh2', '4d6kl2'])('breaks ties by original index and keeps exactly N (%s)', (text) => {
    const result = evaluate(parseDiceExpression(text), { rollDie: () => 3 });
    expect(result.dice.map((d) => d.kept)).toEqual([true, true, false, false]);
    expect(result.total).toBe(6);
  });

  it.each([
    ['d20+7', [20], 20], ['d20-2', [1], 1], ['2d20kh1+8', [1, 20], 20],
    ['2d20kl1+7', [20, 1], 1], ['2d20kh1', [20, 20], 20],
    ['2d20kh1', [1, 15], undefined], ['2d20kl1', [20, 7], undefined],
    ['2d20', [20, 1], undefined], ['2d20kh2', [20, 20], undefined],
    ['d6', [1], undefined], ['d100', [20], undefined], ['d20+19', [1], 1],
    ['d20+1', [19], undefined], ['d20-19', [20], 20],
  ])('detects only a single retained natural d20 (%s, %j)', (text, values, natural) => {
    expect(evaluate(parseDiceExpression(text), { rollDie: diceSequence(...values) }).natural).toBe(natural);
  });

  it('keeps all dice when keep count equals dice count', () => {
    const result = evaluate(parseDiceExpression('4d6kh4'), { rollDie: () => 6 });
    expect(result.dice.every((die) => die.kept)).toBe(true);
    expect(result.total).toBe(24);
  });

  it('does not mutate or retain the caller’s expression object', () => {
    const expression = parseDiceExpression('2d20kh1');
    const before = structuredClone(expression);
    const result = evaluate(expression, { rollDie: () => 3 });
    expect(expression).toEqual(before);
    expect(result.expression).not.toBe(expression);
    expect(result.expression.keep).not.toBe(expression.keep);
  });

  it.each([0, 7, 1.5, NaN, Infinity])('rejects invalid injected randomness %s', (value) => {
    expect(() => evaluate(parseDiceExpression('d6'), { rollDie: () => value })).toThrow(RangeError);
  });

  it('validates programmatically constructed expressions before using randomness', () => {
    const rollDie = vi.fn(() => 1);
    expect(() => evaluate({ count: 1_000_000, sides: 6, modifier: 0 }, { rollDie })).toThrow();
    expect(rollDie).not.toHaveBeenCalled();
  });

  it('secure RNG returns integers within bounds (not a statistical fairness test)', () => {
    for (const sides of [2, 6, 20, 10000]) {
      const result = evaluate({ count: 100, sides, modifier: 0 });
      expect(result.dice).toHaveLength(100);
      expect(result.dice.every((d) => Number.isInteger(d.value) && d.value >= 1 && d.value <= sides)).toBe(true);
    }
  });
});
