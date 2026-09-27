import { ASK_PROCESSING_FAILED_MESSAGE } from '@keeply-ax/shared';

interface CreateFollowupErrorParams {
  applicationId: string;
  interactionToken: string;
}

export const createFollowupError = async ({ applicationId, interactionToken }: CreateFollowupErrorParams): Promise<void> => {
  try {
    await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: ASK_PROCESSING_FAILED_MESSAGE, allowed_mentions: { parse: [] } }),
    });
  } catch {
    // followup 실패는 더 할 수 있는 조치가 없으므로 조용히 무시한다.
  }
};
