import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  type RESTPutAPIApplicationGuildCommandsJSONBody,
} from 'discord-api-types/v10';

const DEFAULT_APPLICATION_ID = '1553430002102698084';
const DEFAULT_GUILD_ID = '1551189816585101323';
const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

const COMMANDS: RESTPutAPIApplicationGuildCommandsJSONBody = [
  {
    name: 'ask',
    description: '기능 구현 현황을 질문합니다',
    type: ApplicationCommandType.ChatInput,
    options: [
      {
        name: 'question',
        description: '궁금한 기능 구현 현황',
        type: ApplicationCommandOptionType.String,
        required: true,
        max_length: 500,
      },
    ],
  },
];

const registerCommands = async () => {
  const { DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID } = process.env;
  if (!DISCORD_BOT_TOKEN) {
    console.error('DISCORD_BOT_TOKEN이 설정되지 않았습니다. 저장소 루트의 .env에 추가해 주세요.');
    process.exit(1);
  }
  const applicationId = DISCORD_APPLICATION_ID ?? DEFAULT_APPLICATION_ID;
  const guildId = DISCORD_GUILD_ID ?? DEFAULT_GUILD_ID;

  const response = await fetch(`${DISCORD_API_BASE_URL}/applications/${applicationId}/guilds/${guildId}/commands`, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(COMMANDS),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`커맨드 등록 실패 (status ${response.status})`);
    console.error(errorBody);
    process.exit(1);
  }
  console.log(`커맨드 등록 성공 (status ${response.status})`);
};

await registerCommands();
