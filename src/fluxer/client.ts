import { Client, Events, createLogger as createSdkLogger } from '@fluxerjs/core';
import type { Logger } from '../logger.js';
import { GuidedRolls } from '../guided/sessions.js';
import { welcomeGuild } from './welcome.js';
import { handleMessage } from './command-router.js';

// These gateway closures cannot recover with the current configuration.
const TERMINAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

export function createDiceClient(logger: Logger, onFatal: () => void): Client {
  const client = new Client({
    cache: { messages: false },
    emitGuildCreateOnStartup: false,
    defaultReplyPing: false,
    defaultAllowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
    // Raw SDK diagnostics can include request data. Use our fixed event logs only.
    logger: createSdkLogger({ level: 'error', sink: () => {} }),
    gatewayDebug: false,
  });
  const guided = new GuidedRolls(logger);
  const destroy = client.destroy.bind(client);
  client.destroy = async () => { guided.dispose(); await destroy(); };
  client.on(Events.GuildCreate, (guild) => {
    void welcomeGuild(guild, logger).catch(() => logger.warn('welcome_failed'));
  });
  client.on(Events.MessageReactionAdd, (event) => {
    void guided.handleReaction(event).catch(() => logger.error('guided_update_failed'));
  });
  client.on(Events.MessageDelete, (message) => guided.removePrompt(message.id));
  client.on(Events.MessageDeleteBulk, (event) => event.ids.forEach(id => guided.removePrompt(id)));
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
    void (async () => {
      if (!(await guided.handleMessage(message))) await handleMessage(message, logger);
    })().catch(() => logger.error('command_failed'));
  });
  return client;
}
