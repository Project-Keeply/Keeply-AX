interface EditOriginalMessageParams {
  applicationId: string;
  interactionToken: string;
  content: string;
}

export const editOriginalMessage = async ({ applicationId, interactionToken, content }: EditOriginalMessageParams): Promise<void> => {
  const response = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
  if (!response.ok) {
    throw new Error(`Discord 원본 메시지 수정 실패 (status ${response.status})`);
  }
};
