export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = typeof LOG_LEVELS[number];
export type Config = { token: string; logLevel: LogLevel };

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = env.FLUXER_BOT_TOKEN?.trim();
  if (!token) throw new ConfigError('Set FLUXER_BOT_TOKEN before starting the bot.');
  if (/\s/.test(token)) throw new ConfigError('FLUXER_BOT_TOKEN must not contain whitespace.');
  const logLevel = env.LOG_LEVEL?.trim().toLowerCase() || 'info';
  if (!LOG_LEVELS.includes(logLevel as LogLevel)) {
    throw new ConfigError('LOG_LEVEL must be debug, info, warn, error, or silent.');
  }
  return { token, logLevel: logLevel as LogLevel };
}
