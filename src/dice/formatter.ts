import { DiceParseError } from './errors.js';
import { LIMITS } from './limits.js';
import type { DiceExpression, DieResult, RollResult, RollStyle } from './types.js';

function formatModifier(modifier: number): string {
  return modifier === 0 ? '' : ` ${modifier > 0 ? '+' : '-'} ${Math.abs(modifier)}`;
}

export function formatExpression(expression: DiceExpression): string {
  const dice = `${expression.count === 1 ? '' : expression.count}d${expression.sides}`;
  const keep = expression.keep ? `k${expression.keep.type === 'highest' ? 'h' : 'l'}${expression.keep.count}` : '';
  return dice + keep + formatModifier(expression.modifier);
}

/** Preserve names/acronyms; remove controls and escape markdown, links and mentions. */
export function formatLabel(label: string): string {
  return label.toWellFormed()
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.labelLength)
    .replace(/[\\`*_{}\[\]()<>#+.!|~\-]/g, '\\$&')
    .replace(/@/g, '@\u200b');
}

function formatDie(die: DieResult, natural: RollResult['natural']): string {
  if (!die.kept) return `~~${die.value}~~`;
  return natural ? `**${die.value}**` : String(die.value);
}

function summarize(result: RollResult): string {
  const kept = result.dice.filter((die) => die.kept);
  const dropped = result.dice.length - kept.length;
  // All dice contribute to the total. The explicitly marked preview is bounded.
  const preview = result.dice.slice(0, LIMITS.detailedDice).map((die) => formatDie(die, result.natural));
  return [
    `First ${LIMITS.detailedDice} of ${result.dice.length} rolls: [${preview.join(', ')}, …]`,
    `Kept ${kept.length}${dropped ? `; dropped ${dropped}` : ''}. Subtotal: ${result.subtotal}${formatModifier(result.modifier)}`,
  ].join('\n');
}

export function formatRoll(result: RollResult, label = '', style: RollStyle = 'roll'): string {
  const title = formatLabel(label);
  const mode = style === 'advantage' ? 'Advantage' : style === 'disadvantage' ? 'Disadvantage' : '';
  const heading = mode ? mode + (title ? ` — ${title}` : '') : title || 'Dice Roll';
  const values = result.dice.map((die) => formatDie(die, result.natural)).join(', ');
  const detail = result.dice.length > LIMITS.detailedDice ? summarize(result)
    : result.dice.length === 1 ? `Roll: ${values}${formatModifier(result.modifier)}`
      : `Rolls: [${values}]${formatModifier(result.modifier)}`;
  const lines = [`🎲 ${heading}`, formatExpression(result.expression), detail];
  if (result.natural === 20) lines.push('✨ **Natural 20!**');
  if (result.natural === 1) lines.push('💀 **Natural 1!**');
  lines.push(`Total: **${result.total}**`);
  const content = lines.join('\n');
  // With validated inputs and the bounded preview this cannot be reached.
  if (content.length > LIMITS.responseLength) throw new RangeError('Roll response exceeds output limit.');
  return content;
}

export function formatError(error: DiceParseError): string {
  switch (error.code) {
    case 'DICE_COUNT_MIN': return '❌ Roll at least 1 die.';
    case 'DICE_COUNT_MAX': return `❌ You can roll at most ${LIMITS.dice} dice at once.`;
    case 'SIDES_MIN': return `❌ Dice must have at least ${LIMITS.minSides} sides.`;
    case 'SIDES_MAX': return `❌ Dice can have at most ${LIMITS.sides} sides.`;
    case 'KEEP_MIN': return '❌ You must keep at least 1 die.';
    case 'KEEP_MAX': return Number.isSafeInteger(error.details.keep)
      ? `❌ You can't keep ${error.details.keep} dice when only ${error.details.count} were rolled.`
      : "❌ You can't keep more dice than you roll.";
    case 'MODIFIER_RANGE': return `❌ Use a whole-number modifier between -${LIMITS.modifier} and +${LIMITS.modifier}.`;
    case 'INVALID_MODIFIER': return '❌ Use a signed whole-number modifier, such as `+7` or `-2`.';
    case 'INPUT_TOO_LONG': return `❌ Keep commands to ${LIMITS.inputLength} characters or fewer.`;
    case 'LABEL_TOO_LONG': return `❌ Keep roll labels to ${LIMITS.labelLength} characters or fewer.`;
    case 'INVALID_SYNTAX': return "❌ I couldn't understand that roll. Use one dice group and an optional modifier.\nTry: `!r d20`, `!r 2d6+4`, or `!r 4d6kh3`. Type `!help` for more.";
  }
}

export function formatUnexpectedError(): string {
  return "❌ Something went wrong while rolling. Please try again.";
}

export function formatHelp(): string {
  return [
    '🎲 **Dice Roller**',
    'Basic: `!r d20` · `!r 2d6+4` · `!r d20-2`',
    'Keep highest / lowest: `!r 4d6kh3` · `!r 2d20kl1+5`',
    'Advantage: `!adv +7 perception`',
    'Disadvantage: `!dis +3 stealth`',
    'Add a label: `!r 8d6 fireball damage`',
    '`!roll` also works. Case and spaces around + / - do not matter.',
    'One dice group per roll; natural 1/20 callouts do not apply game rules.',
    `Limits: ${LIMITS.dice} dice, ${LIMITS.minSides}–${LIMITS.sides} sides, ±${LIMITS.modifier} modifier, ${LIMITS.inputLength} characters (${LIMITS.labelLength} for labels).`,
  ].join('\n');
}
