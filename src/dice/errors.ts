export type DiceErrorCode =
  | 'INVALID_SYNTAX'
  | 'DICE_COUNT_MIN'
  | 'DICE_COUNT_MAX'
  | 'SIDES_MIN'
  | 'SIDES_MAX'
  | 'KEEP_MIN'
  | 'KEEP_MAX'
  | 'MODIFIER_RANGE'
  | 'INVALID_MODIFIER'
  | 'INPUT_TOO_LONG'
  | 'LABEL_TOO_LONG';

/** Carries only a category and validated numeric context, never raw user input. */
export class DiceParseError extends Error {
  constructor(
    public readonly code: DiceErrorCode,
    public readonly details: Readonly<{ count?: number; keep?: number }> = {},
  ) {
    super(code);
    this.name = 'DiceParseError';
  }
}
