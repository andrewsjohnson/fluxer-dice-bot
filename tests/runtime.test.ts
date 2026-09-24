import { Events } from '@fluxerjs/core';
import { describe, expect, it, vi } from 'vitest';
import { ConfigError, readConfig } from '../src/config.js';
import { createDiceClient } from '../src/fluxer/client.js';
import { createLogger } from '../src/logger.js';
import { testLogger } from './helpers.js';

describe('configuration', () => {
  it('requires a token and never returns the token in configuration errors', () => {
    expect(() => readConfig({})).toThrow(ConfigError);
    expect(() => readConfig({ FLUXER_BOT_TOKEN: '  ' })).toThrow('Set FLUXER_BOT_TOKEN');
    expect(() => readConfig({ FLUXER_BOT_TOKEN: 'secret token' })).toThrow('must not contain whitespace');
    expect(() => readConfig({ FLUXER_BOT_TOKEN: 'secret', LOG_LEVEL: 'secret-level' })).toThrow('LOG_LEVEL must be');
  });

  it('defaults to info and supports quiet production logs', () => {
    expect(readConfig({ FLUXER_BOT_TOKEN: ' secret ' })).toEqual({ token: 'secret', logLevel: 'info' });
    expect(readConfig({ FLUXER_BOT_TOKEN: 'secret', LOG_LEVEL: ' WARN ' }).logLevel).toBe('warn');
    expect(readConfig({ FLUXER_BOT_TOKEN: 'secret', LOG_LEVEL: 'silent' }).logLevel).toBe('silent');
  });
});

describe('logging', () => {
  it('respects levels and only emits allowlisted metadata', () => {
    const sink = vi.fn();
    const logger = createLogger('warn', sink);
    logger.info('ready');
    logger.warn('gateway_disconnected', { closeCode: 1006 });
    logger.error('command_failed', { command: 'roll' });
    expect(sink.mock.calls).toEqual([
      ['[warn] gateway_disconnected close_code=1006'],
      ['[error] command_failed command=roll'],
    ]);
    createLogger('silent', sink).error('startup_failed');
    expect(sink).toHaveBeenCalledTimes(2);
  });
});

describe('real SDK client wiring (no network)', () => {
  it('disables message caching, gateway diagnostics, and mention pings', async () => {
    const client = createDiceClient(testLogger(), vi.fn());
    expect(client.options.cache?.messages).toBe(false);
    expect(client.options.gatewayDebug).toBe(false);
    expect(client.options.defaultReplyPing).toBe(false);
    expect(client.options.defaultAllowedMentions).toEqual({ parse: [], users: [], roles: [], repliedUser: false });
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    client.logger.error('secret-token', { message: 'private chat' });
    expect(output).not.toHaveBeenCalled();
    output.mockRestore();
    await client.destroy();
  });

  it('leaves temporary disconnections to SDK recovery and logs readiness/resume', async () => {
    const logger = testLogger();
    const fatal = vi.fn();
    const client = createDiceClient(logger, fatal);
    client.emit(Events.ShardReady, 0);
    client.emit(Events.Ready);
    client.emit(Events.ShardDisconnect, 0, 1006);
    client.emit(Events.ShardResumed, 0);
    client.emit(Events.Error, new Error('secret-token'));
    expect(fatal).not.toHaveBeenCalled();
    expect(logger.info.mock.calls).toEqual([['connected'], ['ready'], ['gateway_resumed']]);
    expect(logger.warn).toHaveBeenCalledWith('gateway_disconnected', { closeCode: 1006 });
    expect(logger.error).toHaveBeenCalledExactlyOnceWith('gateway_error');
    await client.destroy();
  });

  it('requests process shutdown on an unrecoverable gateway closure', async () => {
    const fatal = vi.fn();
    const client = createDiceClient(testLogger(), fatal);
    client.emit(Events.ShardDisconnect, 0, 4004);
    expect(fatal).toHaveBeenCalledTimes(1);
    await client.destroy();
  });
});
