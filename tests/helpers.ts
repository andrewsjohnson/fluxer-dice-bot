import { vi } from 'vitest';

export function diceSequence(...values: number[]) {
  let index = 0;
  return vi.fn((_sides: number) => {
    const value = values[index++];
    if (value === undefined) throw new Error('Test dice sequence exhausted.');
    return value;
  });
}

export function testLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}
