import { TextChannel, type Guild } from '@fluxerjs/core';
import { safeMessage } from '../guided/sessions.js';
import type { Logger } from '../logger.js';

export const WELCOME = [
  '🎲 **Dice bot is ready!**',
  '`!roll` — build a roll with reactions and replies',
  '`!r d20+7 attack` — roll with a modifier',
  '`!r 4d6kh3` — keep the highest three',
  '`!adv +8 perception` — roll with advantage',
  '`!dis +3 stealth` — roll with disadvantage',
  'Type `!help` for commands and limits.',
].join('\n');

export async function welcomeGuild(guild: Guild, logger: Logger): Promise<void> {
  const me = guild.members.me ?? (guild.client.user ? await guild.members.resolve(guild.client.user.id) : null);
  if (!me) return;
  const channels = [...guild.channels.values()]
    .filter((channel): channel is TextChannel => channel instanceof TextChannel)
    .sort((a, b) => {
      if (a.id === guild.systemChannelId) return -1;
      if (b.id === guild.systemChannelId) return 1;
      return (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id);
    });
  const channel = channels.find(c => me.permissionsIn(c).has(['ViewChannel', 'SendMessages']));
  if (!channel) return;
  // One send attempt: a network failure may have delivered, so don't cross-post.
  try { await channel.send(safeMessage(WELCOME)); }
  catch { logger.warn('welcome_failed'); }
}
