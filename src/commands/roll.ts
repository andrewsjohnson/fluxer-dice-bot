import { evaluate } from '../dice/evaluator.js';
import { formatRoll } from '../dice/formatter.js';
import { parseRollInput } from '../dice/parser.js';
import type { RollOptions } from '../dice/types.js';

export function roll(input: string, options: RollOptions = {}): string {
  const { expression, label } = parseRollInput(input);
  return formatRoll(evaluate(expression, options), label);
}
