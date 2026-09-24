import { Client, Events, createLogger as createSdkLogger } from '@fluxerjs/core';
import type { Logger } from '../logger.js';
import { handleMessage } from './command-router.js';

// These gateway closures cannot recover with the current configuration.
const TERMINAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

export function createDiceClient(logger: Logger, onFatal: () => void): Client {
  const client = new Client({
    cache: { messages: false },
    defaultReplyPing: false,
    defaultAllowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
    // Raw SDK diagnostics can include request data. Use our fixed event logs only.
    logger: createSdkLogger({ level: 'error', sink: () => {} }),
    gatewayDebug: false,
  });
  client.on(Events.Ready, () => logger.info('ready'));
  client.on(Events.ShardReady, () => logger.info('connected'));
  client.on(Events.ShardResumed, () => logger.info('gateway_resumed'));
  client.on(Events.ShardDisconnect, (_shardId, closeCode) => {
    if (TERMINAL_CLOSE_CODES.has(closeCode)) {
      logger.error('gateway_terminal_close', { closeCode });
      onFatal();
    } else if (closeCode !== 1000) {
      logger.warn('gateway_disconnected', { closeCode });
    }
  });
  client.on(Events.Error, () => logger.error('gateway_error'));
  client.on(Events.MessageCreate, (message) => {
    void handleMessage(message, logger).catch(() => logger.error('command_failed'));
  });
  return client;
}
