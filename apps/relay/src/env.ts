export interface Env {
  DISCORD_PUBLIC_KEY: string;
  ALLOWED_GUILD_IDS: string;
  ALLOWED_CHANNEL_IDS: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_WORKFLOW: string;
  GITHUB_REF: string;
  DISCORD_APPLICATION_ID: string;
  /** 시크릿: `pnpm exec wrangler secret put GITHUB_TOKEN`으로 등록 (fine-grained PAT: Keeply-AX 저장소, Actions Read and write 권한) */
  GITHUB_TOKEN: string;
  /** 시크릿: `pnpm exec wrangler secret put AX_PAYLOAD_KEY`로 등록 (openssl rand -base64 32) */
  AX_PAYLOAD_KEY: string;
}
