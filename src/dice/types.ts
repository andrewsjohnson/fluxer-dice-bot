export type DiceExpression = {
  count: number;
  sides: number;
  modifier: number;
  keep?: { type: 'highest' | 'lowest'; count: number };
};

export type DieResult = { value: number; kept: boolean };

export type RollResult = {
  expression: DiceExpression;
  dice: DieResult[];
  subtotal: number;
  modifier: number;
  total: number;
  natural?: 1 | 20;
};

export type RollOptions = { rollDie?: (sides: number) => number };
export type RollInput = { expression: DiceExpression; label: string };
export type RollStyle = 'roll' | 'advantage' | 'disadvantage';
