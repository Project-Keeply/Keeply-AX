import type { APIEmbed } from 'discord-api-types/v10';

interface EditOriginalMessageParams {
  applicationId: string;
  interactionToken: string;
  /** 텍스트 답변. embed만 보낼 때는 빈 문자열로 두어 "생각 중" 표시를 지운다. */
  content: string;
  embeds?: APIEmbed[];
}

export const editOriginalMessage = async ({
  applicationId,
  interactionToken,
  content,
  embeds = [],
}: EditOriginalMessageParams): Promise<void> => {
  const response = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    // 질문·근거 제목에 @everyone 등이 들어 있어도 멘션 알림이 가지 않도록 막는다 (embed 포함 메시지 전체에 적용).
    body: JSON.stringify({ content, embeds, allowed_mentions: { parse: [] } }),
  });
  if (!response.ok) {
    throw new Error(`Discord 원본 메시지 수정 실패 (status ${response.status})`);
  }
};
