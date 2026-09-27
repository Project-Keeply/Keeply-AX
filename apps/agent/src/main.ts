import { ASK_PROCESSING_FAILED_MESSAGE, getDecryptedPayload } from '@keeply-ax/shared';
import { createEchoAnswer } from './answers/create-echo-answer';
import { editOriginalMessage } from './discords/edit-original-message';

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} 환경 변수가 설정되지 않았습니다.`);
    process.exit(1);
  }
  return value;
};

const main = async (): Promise<void> => {
  const encryptedPayload = getRequiredEnv('AX_PAYLOAD');
  const payloadKey = getRequiredEnv('AX_PAYLOAD_KEY');
  const applicationId = getRequiredEnv('DISCORD_APPLICATION_ID');

  const payload = await getDecryptedPayload(encryptedPayload, payloadKey);
  // GitHub Actions 로그에 interaction_token 원문이 남지 않도록 즉시 마스킹한다.
  console.log(`::add-mask::${payload.interaction_token}`);
  console.log('payload 복호화 완료');

  try {
    const answer = createEchoAnswer(payload.question);
    await editOriginalMessage({ applicationId, interactionToken: payload.interaction_token, content: answer });
    console.log('답변 전송 완료');
  } catch (error) {
    console.error('답변 전송 실패');
    try {
      await editOriginalMessage({
        applicationId,
        interactionToken: payload.interaction_token,
        content: ASK_PROCESSING_FAILED_MESSAGE,
      });
    } catch {
      // 오류 안내 전송도 실패하면 더 할 수 있는 조치가 없다.
    }
    throw error;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '알 수 없는 오류로 종료합니다.');
  process.exit(1);
});
