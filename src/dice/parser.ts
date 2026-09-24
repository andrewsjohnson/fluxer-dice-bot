import { DiceParseError } from './errors.js';
import { LIMITS } from './limits.js';
import type { DiceExpression, RollInput } from './types.js';

const EXPRESSION = /^(\d*)d(\d+)(?:(kh|kl)(\d+))?(?:\s*([+-])\s*(\d+))?$/;
const EXPRESSION_PREFIX = /^\d*d\d+(?:(?:kh|kl)\d+)?(?:\s*[+-]\s*\d+)?/i;

export function checkInputLength(input: string): void {
  // Count UTF-16 units, matching JS/platform message limits; check before parsing.
  if (input.length > LIMITS.inputLength) throw new DiceParseError('INPUT_TOO_LONG');
}

/** Also protects callers that build the IR directly instead of using the parser. */
export function validateExpression(expression: DiceExpression): void {
  const { count, sides, modifier, keep } = expression;
  if (!Number.isInteger(count) || count < 1) throw new DiceParseError('DICE_COUNT_MIN');
  if (count > LIMITS.dice) throw new DiceParseError('DICE_COUNT_MAX');
  if (!Number.isInteger(sides) || sides < LIMITS.minSides) throw new DiceParseError('SIDES_MIN');
  if (sides > LIMITS.sides) throw new DiceParseError('SIDES_MAX');
  if (!Number.isSafeInteger(modifier) || Math.abs(modifier) > LIMITS.modifier) {
    throw new DiceParseError('MODIFIER_RANGE');
  }
  if (keep) {
    if (keep.type !== 'highest' && keep.type !== 'lowest') throw new DiceParseError('INVALID_SYNTAX');
    if (!Number.isInteger(keep.count) || keep.count < 1) throw new DiceParseError('KEEP_MIN');
    if (keep.count > count) throw new DiceParseError('KEEP_MAX', { count, keep: keep.count });
  }
}

/** Strict parser: consumes the entire expression and never generates randomness. */
export function parseDiceExpression(input: string): DiceExpression {
  checkInputLength(input);
  const match = EXPRESSION.exec(input.trim().toLowerCase());
  if (!match) throw new DiceParseError('INVALID_SYNTAX');
  const [, count, sides, keepType, keepCount, sign, magnitude] = match;
  const expression: DiceExpression = {
    count: count ? Number(count) : 1,
    sides: Number(sides),
    modifier: magnitude ? Number(magnitude) * (sign === '-' ? -1 : 1) : 0,
    ...(keepType ? { keep: { type: keepType === 'kh' ? 'highest' as const : 'lowest' as const, count: Number(keepCount) } } : {}),
  };
  validateExpression(expression);
  return expression;
}

function parseLabel(tail: string): string {
  // Require a separator: d20fireball and d20+1d6 must never become partial rolls.
  if (tail && !/^\s/.test(tail)) throw new DiceParseError('INVALID_SYNTAX');
  const label = tail.trim();
  // Reserve formula continuations so unsupported math is not silently a label.
  if (/^(?:[+\-*/%^=]|(?:kh|kl)\d*\b|\d*d\d)/i.test(label)) {
    throw new DiceParseError('INVALID_SYNTAX');
  }
  if (label.length > LIMITS.labelLength) throw new DiceParseError('LABEL_TOO_LONG');
  return label;
}

export function parseRollInput(input: string): RollInput {
  checkInputLength(input);
  const trimmed = input.trim();
  const match = EXPRESSION_PREFIX.exec(trimmed);
  if (!match) throw new DiceParseError('INVALID_SYNTAX');
  return {
    expression: parseDiceExpression(match[0]),
    label: parseLabel(trimmed.slice(match[0].length)),
  };
}

export function parseD20Input(input: string, type: 'highest' | 'lowest'): RollInput {
  checkInputLength(input);
  const trimmed = input.trim();
  const match = /^([+-])\s*(\d+)/.exec(trimmed);
  if (!match && /^[+\-\d]/.test(trimmed)) throw new DiceParseError('INVALID_MODIFIER');
  const base = type === 'highest' ? '2d20kh1' : '2d20kl1';
  return {
    expression: parseDiceExpression(base + (match ? `${match[1]}${match[2]}` : '')),
    label: parseLabel(match ? trimmed.slice(match[0].length) : ` ${trimmed}`),
  };
}
