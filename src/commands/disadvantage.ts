import { evaluate } from '../dice/evaluator.js';
import { formatRoll } from '../dice/formatter.js';
import { parseD20Input } from '../dice/parser.js';
import type { RollOptions } from '../dice/types.js';

export function disadvantage(input: string, options: RollOptions = {}): string {
  const { expression, label } = parseD20Input(input, 'lowest');
  return formatRoll(evaluate(expression, options), label, 'disadvantage');
}
