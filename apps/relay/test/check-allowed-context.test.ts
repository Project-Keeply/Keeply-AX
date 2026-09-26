import { describe, expect, it } from 'vitest';
import { checkAllowedContext } from '../src/utils/check-allowed-context';

const ENV = { ALLOWED_GUILD_IDS: 'guild-1', ALLOWED_CHANNEL_IDS: 'channel-1,channel-2' };

describe('checkAllowedContext', () => {
  it('허용된 서버·채널이면 true', () => {
    expect(checkAllowedContext({ guildId: 'guild-1', channelId: 'channel-2', env: ENV })).toBe(true);
  });

  it('허용되지 않은 채널이면 false', () => {
    expect(checkAllowedContext({ guildId: 'guild-1', channelId: 'channel-9', env: ENV })).toBe(false);
  });

  it('허용되지 않은 서버면 false', () => {
    expect(checkAllowedContext({ guildId: 'guild-9', channelId: 'channel-1', env: ENV })).toBe(false);
    expect(checkAllowedContext({ guildId: undefined, channelId: 'channel-1', env: ENV })).toBe(false);
  });

  it('목록의 공백과 빈 항목을 무시', () => {
    const env = { ALLOWED_GUILD_IDS: ' guild-1 , ', ALLOWED_CHANNEL_IDS: ' , channel-1 ,,' };
    expect(checkAllowedContext({ guildId: 'guild-1', channelId: 'channel-1', env })).toBe(true);
    expect(checkAllowedContext({ guildId: 'guild-1', channelId: '', env })).toBe(false);
  });
});
