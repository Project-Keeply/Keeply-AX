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
