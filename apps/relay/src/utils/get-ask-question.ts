import {
  ApplicationCommandOptionType,
  type APIChatInputApplicationCommandInteractionData,
} from 'discord-api-types/v10';

const QUESTION_OPTION_NAME = 'question';

export const getAskQuestion = (data: APIChatInputApplicationCommandInteractionData): string | null => {
  const options = data.options ?? [];
  const questionOption = options.find(
    (option): option is Extract<(typeof options)[number], { type: ApplicationCommandOptionType.String }> =>
      option.name === QUESTION_OPTION_NAME && option.type === ApplicationCommandOptionType.String,
  );
  if (!questionOption || questionOption.value.length === 0) {
    return null;
  }
  return questionOption.value;
};
