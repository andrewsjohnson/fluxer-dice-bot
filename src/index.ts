import { ConfigError, readConfig } from './config.js';
import { createDiceClient } from './fluxer/client.js';
import { createLogger } from './logger.js';

async function main(): Promise<void> {
  // Validate before creating a gateway connection or registering event handlers.
  const config = readConfig();
  const logger = createLogger(config.logLevel);
  let stopping = false;
  const controller = new AbortController();
  const client = createDiceClient(logger, () => { void shutdown(1); });

  async function shutdown(exitCode: number): Promise<void> {
    if (stopping) return;
    stopping = true;
    logger.info('shutting_down');
    controller.abort();
    const deadline = setTimeout(() => {
      logger.error('shutdown_timeout');
      process.exit(1);
    }, 5_000);
    try {
      await client.destroy();
      logger.info('shutdown_complete');
    } catch {
      logger.error('shutdown_failed');
      exitCode = 1;
    } finally {
      clearTimeout(deadline);
      process.exit(exitCode);
    }
  }

  process.once('SIGINT', () => { void shutdown(0); });
  process.once('SIGTERM', () => { void shutdown(0); });
  process.once('uncaughtException', () => {
    logger.error('uncaught_exception');
    void shutdown(1);
  });
  process.once('unhandledRejection', () => {
    logger.error('unhandled_rejection');
    void shutdown(1);
  });

  logger.info('starting');
  const startupTimeout = setTimeout(() => {
    logger.error('startup_failed');
    void shutdown(1);
  }, 60_000);
  try {
    await client.login(config.token, { signal: controller.signal });
  } catch {
    if (!stopping) {
      logger.error('startup_failed');
      await shutdown(1);
    }
  } finally {
    clearTimeout(startupTimeout);
  }
}

main().catch((error: unknown) => {
  // ConfigError messages are fixed strings, never environment values or tokens.
  console.error(error instanceof ConfigError ? `[error] invalid_config: ${error.message}` : '[error] startup_failed');
  process.exit(1);
});
