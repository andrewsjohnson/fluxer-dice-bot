import { randomInt } from 'node:crypto';
import { validateExpression } from './parser.js';
import type { DiceExpression, RollOptions, RollResult } from './types.js';

export function evaluate(expression: DiceExpression, options: RollOptions = {}): RollResult {
  validateExpression(expression);
  const rollDie = options.rollDie ?? ((sides: number) => randomInt(1, sides + 1));
  const dice = Array.from({ length: expression.count }, () => {
    const value = rollDie(expression.sides);
    if (!Number.isInteger(value) || value < 1 || value > expression.sides) {
      throw new RangeError('The random source returned an invalid die value.');
    }
    return { value, kept: !expression.keep };
  });

  if (expression.keep) {
    const direction = expression.keep.type === 'highest' ? -1 : 1;
    // Stable index tiebreaker; sorting this copy preserves the original roll order.
    const ranked = dice.map((die, index) => ({ die, index }))
      .sort((a, b) => direction * (a.die.value - b.die.value) || a.index - b.index);
    for (const { die } of ranked.slice(0, expression.keep.count)) die.kept = true;
  }

  const retained = dice.filter((die) => die.kept);
  const subtotal = retained.reduce((sum, die) => sum + die.value, 0);
  const single = retained.length === 1 ? retained[0]?.value : undefined;
  const natural = expression.sides === 20 && (single === 1 || single === 20) ? single : undefined;
  return {
    expression: { ...expression, ...(expression.keep ? { keep: { ...expression.keep } } : {}) },
    dice,
    subtotal,
    modifier: expression.modifier,
    total: subtotal + expression.modifier,
    ...(natural ? { natural } : {}),
  };
}
