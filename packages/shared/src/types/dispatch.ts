/**
 * relay Worker가 workflow_dispatch로 agent 워크플로에 넘기기 전, 암호화 대상이 되는 평문 페이로드
 * GitHub workflow inputs로 직접 넘기지 않고 이 값 전체를 암호화한 뒤 단일 문자열로 전달한다.
 * (저장소가 public이므로 interaction_token, question 등 민감값이 workflow_dispatch 입력에 그대로 노출되면 안 된다.)
 * 필드는 snake_case를 사용하고, 모든 값은 문자열이다.
 */
export interface AskPayload {
  question: string;
  interaction_token: string;
  channel_id: string;
  user_id: string;
}
