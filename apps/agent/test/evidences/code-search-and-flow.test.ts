import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractSnippets, scoreCodeFiles } from '../../src/evidences/filter-relevant-code';
import { getClientCallFlow, getServerCallFlow } from '../../src/evidences/get-call-flow';
import { getCodeMatches } from '../../src/evidences/get-code-matches';

const execFileAsync = promisify(execFile);

// rg가 로컬에 없으면 조용히 스킵하지 않고 명확한 실패로 알린다 (CI ubuntu-latest에는 사전 설치되어 있다).
const assertRipgrepIsAvailable = async (): Promise<void> => {
  try {
    await execFileAsync('rg', ['--version']);
  } catch {
    throw new Error(
      'ripgrep(rg)이 설치되어 있지 않아 코드 검색 테스트를 실행할 수 없습니다. `brew install ripgrep` 등으로 설치 후 다시 실행하세요.',
    );
  }
};

const writeFixtureFile = async (baseDir: string, relativePath: string, content: string): Promise<void> => {
  const absolutePath = path.join(baseDir, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf-8');
};

describe('get-code-matches / filter-relevant-code / get-call-flow', () => {
  let checkoutDir: string;

  beforeAll(async () => {
    await assertRipgrepIsAvailable();
    checkoutDir = await mkdtemp(path.join(os.tmpdir(), 'keeply-ax-evidence-'));

    await writeFixtureFile(
      checkoutDir,
      'src/main/java/com/keeply/notice/controller/NoticeController.java',
      [
        'package com.keeply.notice.controller;',
        '',
        'public class NoticeController {',
        '  private final NoticeService noticeService;',
        '',
        '  public NoticeController(NoticeService noticeService) {',
        '    this.noticeService = noticeService;',
        '  }',
        '',
        '  // 공지사항 목록 조회',
        '  public void getNotices() {',
        '    noticeService.getNotices();',
        '  }',
        '}',
      ].join('\n'),
    );

    await writeFixtureFile(
      checkoutDir,
      'src/main/java/com/keeply/notice/service/NoticeServiceImpl.java',
      [
        'package com.keeply.notice.service;',
        '',
        'public class NoticeServiceImpl implements NoticeService {',
        '  private final NoticeRepository noticeRepository;',
        '',
        '  public NoticeServiceImpl(NoticeRepository noticeRepository) {',
        '    this.noticeRepository = noticeRepository;',
        '  }',
        '}',
      ].join('\n'),
    );

    await writeFixtureFile(
      checkoutDir,
      'src/main/java/com/keeply/notice/repository/NoticeRepository.java',
      ['package com.keeply.notice.repository;', '', 'public interface NoticeRepository {', '}'].join('\n'),
    );

    await writeFixtureFile(
      checkoutDir,
      'src/test/java/com/keeply/notice/controller/NoticeControllerTest.java',
      ['package com.keeply.notice.controller;', '', 'class NoticeControllerTest {', '  // Notice 관련 테스트', '}'].join('\n'),
    );

    // 어떤 Service/Repository와도 연결되지 않은 고아 컨트롤러 (흐름이 비어있어야 한다).
    await writeFixtureFile(
      checkoutDir,
      'src/main/java/com/keeply/orphan/controller/OrphanController.java',
      ['package com.keeply.orphan.controller;', '', 'public class OrphanController {', '}'].join('\n'),
    );

    await writeFixtureFile(
      checkoutDir,
      'pages/notice/NoticePage.tsx',
      ["import NoticeWrite from 'features/notice-write';", '', 'export default function NoticePage() {', '  return null;', '}'].join(
        '\n',
      ),
    );

    await writeFixtureFile(
      checkoutDir,
      'features/notice-write/index.ts',
      ["export const NoticeWrite = () => null;"].join('\n'),
    );

    // 이름이 접두어로 겹치는 모듈 (features/notice ⊂ features/notice-write). 아무도 import하지 않는다.
    await writeFixtureFile(checkoutDir, 'features/notice/index.ts', ['export const Notice = () => null;'].join('\n'));

    await writeFixtureFile(
      checkoutDir,
      'entities/announcement/api.ts',
      ["export const getAnnouncements = async () => {", "  // 공지사항 조회 API", "  return [];", "};"].join('\n'),
    );
  });

  afterAll(async () => {
    await rm(checkoutDir, { recursive: true, force: true });
  });

  it('키워드로 매칭된 코드 라인을 찾는다', async () => {
    const matches = await getCodeMatches(['NoticeController', '공지사항'], checkoutDir);
    expect(matches.some((match) => match.path.includes('NoticeController.java'))).toBe(true);
    expect(matches.some((match) => match.keyword === '공지사항')).toBe(true);
  });

  it('매칭 없는 키워드는 빈 배열을 반환한다 (rg exit code 1)', async () => {
    const matches = await getCodeMatches(['이런키워드는없음xyz'], checkoutDir);
    expect(matches).toEqual([]);
  });

  it('테스트 코드는 검색 대상에서 완전히 제외된다', async () => {
    const matches = await getCodeMatches(['NoticeController'], checkoutDir);
    expect(matches.some((match) => match.path.includes('src/test/'))).toBe(false);
    expect(matches.some((match) => match.path.endsWith('NoticeControllerTest.java'))).toBe(false);
    const scoredFiles = scoreCodeFiles(matches);
    const controllerFile = scoredFiles.find((file) => file.path.endsWith('controller/NoticeController.java'));
    const testFile = scoredFiles.find((file) => file.path.endsWith('NoticeControllerTest.java'));
    expect(controllerFile).toBeDefined();
    expect(testFile).toBeUndefined();
  });

  it('스니펫은 매칭 라인 주변을 포함하고 40줄을 넘지 않는다', async () => {
    const matches = await getCodeMatches(['NoticeService'], checkoutDir);
    const scoredFiles = scoreCodeFiles(matches);
    const snippets = await extractSnippets(checkoutDir, scoredFiles);
    const controllerSnippet = snippets.find((snippet) => snippet.path.endsWith('NoticeController.java'));
    expect(controllerSnippet).toBeDefined();
    expect(controllerSnippet!.snippet.split('\n').length).toBeLessThanOrEqual(40);
    expect(controllerSnippet!.snippet).toContain('noticeService');
  });

  it('Controller -> Service -> Repository 흐름을 추적한다', async () => {
    const flow = await getServerCallFlow('src/main/java/com/keeply/notice/controller/NoticeController.java', checkoutDir);
    expect(flow).toEqual(['NoticeController', 'NoticeService', 'NoticeRepository']);
  });

  it('연결을 찾지 못하면 빈 배열을 반환한다', async () => {
    const flow = await getServerCallFlow('src/main/java/com/keeply/orphan/controller/OrphanController.java', checkoutDir);
    expect(flow).toEqual([]);
  });

  it('클라이언트 모듈을 import하는 page 파일을 찾아 흐름을 만든다', async () => {
    const flow = await getClientCallFlow('features/notice-write/index.ts', checkoutDir);
    expect(flow).toEqual(['pages/notice/NoticePage.tsx', 'features/notice-write/index.ts']);
  });

  it('이름이 접두어로 겹치는 다른 모듈의 import를 흐름으로 오인하지 않는다', async () => {
    const flow = await getClientCallFlow('features/notice/index.ts', checkoutDir);
    expect(flow).toEqual([]);
  });

  it('아무도 import하지 않는 모듈은 빈 흐름을 반환한다', async () => {
    const flow = await getClientCallFlow('entities/announcement/api.ts', checkoutDir);
    expect(flow).toEqual([]);
  });
});
