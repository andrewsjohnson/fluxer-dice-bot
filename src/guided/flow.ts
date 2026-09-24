import { formatExpression } from '../dice/formatter.js';
import type { DiceExpression } from '../dice/types.js';

export type Step = 'sides' | 'count' | 'rules' | 'keep' | 'modifier' | 'confirm';
export type State = { step: Step; expression: DiceExpression };
export type Choice = { emoji: string; text: string; value: string };
export type Flow = { state: State; history: State[] };
export const newFlow = (): Flow => ({ state: { step: 'sides', expression: { count: 1, sides: 20, modifier: 0 } }, history: [] });
const dice = [4, 6, 8, 10, 12, 20, 100];
const digits = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣'];

export function choices({ state, history }: Flow): Choice[] {
  let result: Choice[] = [];
  switch (state.step) {
    case 'sides': result = dice.map((sides, index) => ({ emoji: digits[index]!, text: `d${sides}`, value: String(sides) })); break;
    case 'count': result = [{ emoji: '☝️', text: 'One die', value: '1' }]; break;
    case 'rules': result = [
      { emoji: '➡️', text: 'Normal', value: 'normal' },
      ...(state.expression.sides === 20 ? [
        { emoji: '⬆️', text: 'Advantage (2d20, keep highest 1)', value: 'advantage' },
        { emoji: '⬇️', text: 'Disadvantage (2d20, keep lowest 1)', value: 'disadvantage' },
      ] : []),
      { emoji: '🔼', text: 'Keep highest', value: 'highest' },
      { emoji: '🔽', text: 'Keep lowest', value: 'lowest' },
    ]; break;
    case 'modifier': result = [{ emoji: '⏭️', text: 'None', value: '0' }]; break;
    case 'confirm': result = [{ emoji: '🎲', text: 'Roll', value: 'roll' }]; break;
    case 'keep': break;
  }
  if (history.length) result.push({ emoji: '↩️', text: 'Back', value: 'back' });
  result.push({ emoji: '❌', text: 'Cancel', value: 'cancel' });
  return result;
}

export function prompt(flow: Flow, error = ''): string {
  const { step, expression } = flow.state;
  const question = {
    sides: 'Which die? Reply with d4, d6, d8, d10, d12, d20, d100, or a custom side count (2–10000).',
    count: `How many d${expression.sides} dice? Reply with a number from 1 to 100.`,
    rules: 'Any special rules? Reply normal, advantage, disadvantage, highest, or lowest. Advantage/disadvantage require d20s.',
    keep: `How many dice should I keep? Reply with a number from 1 to ${expression.count}.`,
    modifier: 'Any modifier? Reply +7, -2, or none (maximum ±100000).',
    confirm: `Ready to roll **${formatExpression(expression)}**? Reply roll, back, or cancel.`,
  }[step];
  return ['🎲 **Build a roll**', question, ...choices(flow).map(c => `${c.emoji} ${c.text}`),
    ...(error ? [`❌ ${error}`] : []),
    'React or use Reply on this message. Only the person who started this roll can answer.',
    'Type back or cancel as a reply. Expires after 2 minutes of inactivity. To reuse a selected reaction, toggle it off and on.',
  ].join('\n');
}

export function advance(flow: Flow, raw: string): { action: 'update' | 'roll' | 'cancel'; error?: string } {
  if (raw.length > 200) return { action: 'update', error: 'Keep answers to 200 characters or fewer.' };
  const input = raw.trim().toLowerCase();
  if (input === 'cancel') return { action: 'cancel' };
  if (input === 'back') {
    const previous = flow.history.pop();
    if (previous) flow.state = previous;
    return { action: 'update' };
  }
  const next = structuredClone(flow.state);
  const { expression } = next;
  const number = /^\d+$/.test(input) ? Number(input) : NaN;
  const invalid = (error: string) => ({ action: 'update' as const, error });
  switch (next.step) {
    case 'sides': {
      const sides = /^(?:d)?\d+$/.test(input) ? Number(input.replace(/^d/, '')) : NaN;
      if (!Number.isInteger(sides) || sides < 2 || sides > 10000) return invalid('Choose 2–10000 sides.');
      expression.sides = sides; next.step = 'count'; break;
    }
    case 'count':
      if (!Number.isInteger(number) || number < 1 || number > 100) return invalid('Choose 1–100 dice.');
      expression.count = number; next.step = 'rules'; break;
    case 'rules':
      if (input === 'normal') { delete expression.keep; next.step = 'modifier'; }
      else if (['adv', 'advantage', 'dis', 'disadvantage'].includes(input)) {
        if (expression.sides !== 20) return invalid('Advantage and disadvantage use d20s. Choose normal, highest, or lowest.');
        expression.count = 2;
        expression.keep = { type: input.startsWith('adv') ? 'highest' : 'lowest', count: 1 };
        next.step = 'modifier';
      } else if (['highest', 'kh', 'lowest', 'kl'].includes(input)) {
        expression.keep = { type: ['highest', 'kh'].includes(input) ? 'highest' : 'lowest', count: 1 };
        next.step = 'keep';
      } else return invalid('Choose normal, advantage, disadvantage, highest, or lowest.');
      break;
    case 'keep':
      if (!Number.isInteger(number) || number < 1 || number > expression.count) return invalid(`Keep between 1 and ${expression.count} dice.`);
      expression.keep!.count = number; next.step = 'modifier'; break;
    case 'modifier': {
      const modifier = ['none', '0', 'skip'].includes(input) ? 0 : /^[+-]\s*\d+$/.test(input) ? Number(input.replace(/\s/g, '')) : NaN;
      if (!Number.isSafeInteger(modifier) || Math.abs(modifier) > 100000) return invalid('Use a signed whole number, such as +7 or -2, or none; maximum ±100000.');
      expression.modifier = modifier; next.step = 'confirm'; break;
    }
    case 'confirm': return input === 'roll' || input === 'yes' ? { action: 'roll' } : invalid('Reply roll, back, or cancel.');
  }
  flow.history.push(structuredClone(flow.state));
  flow.state = next;
  return { action: 'update' };
}
