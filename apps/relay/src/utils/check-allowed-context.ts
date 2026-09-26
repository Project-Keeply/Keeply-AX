import type { Env } from '../env';

interface CheckAllowedContextParams {
  guildId: string | undefined;
  channelId: string | undefined;
  env: Pick<Env, 'ALLOWED_GUILD_IDS' | 'ALLOWED_CHANNEL_IDS'>;
}

const convertIdListToSet = (idList: string): Set<string> =>
  new Set(
    idList
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );

export const checkAllowedContext = ({ guildId, channelId, env }: CheckAllowedContextParams): boolean => {
  if (!guildId || !channelId) {
    return false;
  }
  const isAllowedGuild = convertIdListToSet(env.ALLOWED_GUILD_IDS).has(guildId);
  const isAllowedChannel = convertIdListToSet(env.ALLOWED_CHANNEL_IDS).has(channelId);
  return isAllowedGuild && isAllowedChannel;
};
