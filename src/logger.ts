import type { LogLevel } from './config.js';

export type LogEvent =
  | 'starting' | 'connected' | 'ready' | 'gateway_resumed' | 'gateway_disconnected'
  | 'gateway_error' | 'gateway_terminal_close' | 'command_failed' | 'reply_failed'
  | 'shutting_down' | 'shutdown_complete' | 'shutdown_failed' | 'shutdown_timeout'
  | 'guided_update_failed' | 'guided_reaction_failed' | 'welcome_failed'
  | 'startup_failed' | 'uncaught_exception' | 'unhandled_rejection';

type LogFields = { command?: 'roll' | 'advantage' | 'disadvantage' | 'help'; closeCode?: number };
export type Logger = {
  info: (event: LogEvent, fields?: LogFields) => void;
  warn: (event: LogEvent, fields?: LogFields) => void;
  error: (event: LogEvent, fields?: LogFields) => void;
};

/** Only fixed event names and a small metadata allowlist can reach operational logs. */
export function createLogger(level: LogLevel, sink: (line: string) => void = console.log): Logger {
  const levels = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
  function write(severity: 'info' | 'warn' | 'error', event: LogEvent, fields: LogFields = {}): void {
    if (levels[severity] < levels[level]) return;
    sink(`[${severity}] ${event}${fields.command ? ` command=${fields.command}` : ''}${fields.closeCode === undefined ? '' : ` close_code=${fields.closeCode}`}`);
  }
  return {
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}
