import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getCodeMatches } from '../../src/evidences/get-code-matches';

describe('getCodeMatches: rg 실행 파일이 없을 때', () => {
  let checkoutDir: string;
  const originalPath = process.env.PATH;

  beforeAll(async () => {
    checkoutDir = await mkdtemp(path.join(os.tmpdir(), 'keeply-ax-missing-rg-'));
  });

  afterAll(async () => {
    process.env.PATH = originalPath;
    await rm(checkoutDir, { recursive: true, force: true });
  });

  it('PATH에서 rg를 찾을 수 없으면 설치 확인을 안내하는 오류를 던진다', async () => {
    // 실제로 PATH를 비워 rg를 찾을 수 없는 환경(예: rg 미설치 러너)을 만든다.
    process.env.PATH = '';
    try {
      await expect(getCodeMatches(['Notice'], checkoutDir)).rejects.toThrow('ripgrep(rg) 실행 파일을 찾을 수 없습니다');
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
