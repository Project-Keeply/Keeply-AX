/** GitHub API가 응답하지 않을 때 waitUntil이 끝나기 전에 오류 안내 경로로 넘어가기 위한 제한 시간 */
const DISPATCH_TIMEOUT_MS = 10_000;

interface CreateWorkflowDispatchParams {
  owner: string;
  repo: string;
  workflow: string;
  ref: string;
  payload: string;
  token: string;
}

export const createWorkflowDispatch = async ({
  owner,
  repo,
  workflow,
  ref,
  payload,
  token,
}: CreateWorkflowDispatchParams): Promise<void> => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'keeply-ax-relay',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref, inputs: { payload } }),
  });
  if (!response.ok) {
    throw new Error(`workflow_dispatch 호출 실패 (status ${response.status})`);
  }
};
