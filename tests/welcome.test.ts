import { Client, Events, TextChannel, type Guild } from '@fluxerjs/core';
import { describe, expect, it, vi } from 'vitest';
import { welcomeGuild } from '../src/fluxer/welcome.js';
import { createDiceClient } from '../src/fluxer/client.js';
import { testLogger } from './helpers.js';

function fixture() {
  const client = new Client();
  const a = new TextChannel(client, { id: 'a', type: 0, guild_id: 'guild', name: 'general', position: 0 });
  const b = new TextChannel(client, { id: 'b', type: 0, guild_id: 'guild', name: 'system', position: 5 });
  const sendA = vi.spyOn(a, 'send').mockResolvedValue(undefined as never);
  const sendB = vi.spyOn(b, 'send').mockResolvedValue(undefined as never);
  const permissions = vi.fn(() => ({ has: vi.fn(() => true) }));
  const guild = { client, systemChannelId: 'b', channels: new Map([['a', a], ['b', b]]), members: { me: { permissionsIn: permissions } } } as unknown as Guild;
  return { client, guild, sendA, sendB, permissions };
}

describe('community welcome', () => {
  it('prefers an accessible system channel and suppresses all mentions', async () => {
    const f = fixture(); await welcomeGuild(f.guild, testLogger());
    expect(f.sendA).not.toHaveBeenCalled();
    expect(f.sendB).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ content: expect.stringContaining('`!roll`'), allowedMentions: { parse: [], users: [], roles: [], repliedUser: false } }));
    await f.client.destroy();
  });
  it('falls back to the first sendable text channel, or stays silent', async () => {
    const f = fixture();
    f.permissions.mockReturnValueOnce({ has: vi.fn(() => false) });
    await welcomeGuild(f.guild, testLogger());
    expect(f.sendA).toHaveBeenCalledTimes(1); expect(f.sendB).not.toHaveBeenCalled();
    f.permissions.mockReturnValue({ has: vi.fn(() => false) });
    await welcomeGuild(f.guild, testLogger()); expect(f.sendA).toHaveBeenCalledTimes(1);
    await f.client.destroy();
  });
  it('does not cross-post after an ambiguous network send failure', async () => {
    const f = fixture(); const logger = testLogger(); f.sendB.mockRejectedValueOnce(new Error('secret'));
    await welcomeGuild(f.guild, logger);
    expect(f.sendA).not.toHaveBeenCalled(); expect(logger.warn).toHaveBeenCalledExactlyOnceWith('welcome_failed');
    await f.client.destroy();
  });
  it('subscribes to real joins, not startup or recovered guild availability', async () => {
    const f = fixture(); const client = createDiceClient(testLogger(), vi.fn());
    expect(client.options.emitGuildCreateOnStartup).toBe(false);
    client.emit(Events.GuildAvailable, f.guild); client.emit(Events.Ready); client.emit(Events.ShardResumed, 0);
    expect(f.sendB).not.toHaveBeenCalled();
    client.emit(Events.GuildCreate, f.guild);
    await vi.waitFor(() => expect(f.sendB).toHaveBeenCalledTimes(1));
    await client.destroy(); await f.client.destroy();
  });
});
