/**
 * relay Worker가 workflow_dispatch로 agent 워크플로에 넘기는 입력값
 * GitHub workflow inputs 키와 1:1로 대응하므로 snake_case를 사용하고, 모든 값은 문자열이다.
 */
export interface AskDispatchInputs {
  question: string;
  interaction_token: string;
  channel_id: string;
  user_id: string;
}
