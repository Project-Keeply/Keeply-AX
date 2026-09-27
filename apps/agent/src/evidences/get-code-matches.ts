import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const RG_MAX_BUFFER = 10 * 1024 * 1024;
const RG_TIMEOUT_MS = 20_000;

const EXCLUDED_GLOBS = [
  '!**/node_modules/**',
  '!**/build/**',
  '!**/dist/**',
  '!**/.gradle/**',
  '!**/target/**',
  '!**/*.test.*',
  '!**/*.spec.*',
  '!**/__tests__/**',
  '!**/coverage/**',
  '!**/.history/**',
];

export interface CodeMatch {
  path: string;
  line: number;
  text: string;
  keyword: string;
}

interface RgExecError {
  code?: number;
  stdout?: string;
  stderr?: string;
}

const isRgExecError = (error: unknown): error is RgExecError =>
  typeof error === 'object' && error !== null && 'code' in error;

const runRipgrepForKeyword = async (keyword: string, checkoutDir: string): Promise<CodeMatch[]> => {
  const args = [
    '--fixed-strings',
    '--ignore-case',
    '--line-number',
    '--no-heading',
    '--with-filename',
    ...EXCLUDED_GLOBS.flatMap((glob) => ['--glob', glob]),
    '-e',
    keyword,
    '.',
  ];

  try {
    const { stdout } = await execFileAsync('rg', args, {
      cwd: checkoutDir,
      maxBuffer: RG_MAX_BUFFER,
      timeout: RG_TIMEOUT_MS,
    });
    return parseRipgrepOutput(stdout, keyword);
  } catch (error) {
    // rg는 매칭이 없을 때 exit code 1을 반환한다 (에러가 아니라 빈 결과로 취급한다).
    if (isRgExecError(error) && error.code === 1) {
      return [];
    }
    if (isRgExecError(error) && error.code === undefined) {
      throw new Error(`ripgrep(rg) 실행 파일을 찾을 수 없습니다. rg가 설치되어 있는지 확인하세요.`);
    }
    throw new Error(`ripgrep 검색 실패 (keyword: ${keyword}): ${String((error as RgExecError).stderr ?? error)}`);
  }
};

const parseRipgrepOutput = (stdout: string, keyword: string): CodeMatch[] =>
  stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const firstColonIndex = line.indexOf(':');
      const secondColonIndex = line.indexOf(':', firstColonIndex + 1);
      const path = line.slice(0, firstColonIndex).replace(/^\.\//, '');
      const lineNumber = Number(line.slice(firstColonIndex + 1, secondColonIndex));
      const text = line.slice(secondColonIndex + 1);
      return { path, line: lineNumber, text, keyword };
    })
    .filter((match) => match.path !== '' && Number.isInteger(match.line));

/**
 * 주어진 키워드들로 checkoutDir 전체를 ripgrep 검색한다.
 * 키워드별로 개별 실행해 어떤 키워드가 매칭됐는지 보존한다.
 */
export const getCodeMatches = async (keywords: string[], checkoutDir: string): Promise<CodeMatch[]> => {
  const matchesPerKeyword = await Promise.all(
    keywords.filter((keyword) => keyword.trim() !== '').map((keyword) => runRipgrepForKeyword(keyword, checkoutDir)),
  );
  return matchesPerKeyword.flat();
};
