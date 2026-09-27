import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CodeMatch } from './get-code-matches';

const MAX_FILES_TOTAL = 12;
const MAX_SNIPPET_LINES_PER_FILE = 40;
const SNIPPET_CONTEXT_LINES = 5;

const WEIGHT_IDENTIFIER_KEYWORD = 3;
const WEIGHT_PATH_CONTAINS_KEYWORD = 1.5;
const WEIGHT_KOREAN_KEYWORD = 1;

const HAS_ASCII_LETTERS_PATTERN = /[A-Za-z]/;
const HAS_KOREAN_PATTERN = /[가-힣]/;

// 코드 식별자 스타일 키워드(예: NoticeController)는 클래스/모듈명을 직접 가리키므로 높은 가중치를 준다.
const isCodeIdentifierKeyword = (keyword: string): boolean => HAS_ASCII_LETTERS_PATTERN.test(keyword);
const isKoreanKeyword = (keyword: string): boolean => HAS_KOREAN_PATTERN.test(keyword);

export interface ScoredCodeFile {
  path: string;
  score: number;
  matchedKeywords: string[];
  lines: number[];
}

export interface CodeFileSnippet {
  path: string;
  score: number;
  snippet: string;
  startLine: number;
  endLine: number;
  /** 첫 구간 외에 스니펫에 추가로 포함된 구간 수 (Discord 표시용, 예: "L52-60 외 1곳") */
  extraSegmentCount: number;
}

const getFileScore = (path_: string, matches: CodeMatch[]): number => {
  const keywordScore = matches.reduce((total, match) => {
    if (isCodeIdentifierKeyword(match.keyword)) {
      return total + WEIGHT_IDENTIFIER_KEYWORD;
    }
    if (isKoreanKeyword(match.keyword)) {
      return total + WEIGHT_KOREAN_KEYWORD;
    }
    return total + 1;
  }, 0);

  const pathBonus = matches.some((match) => path_.toLowerCase().includes(match.keyword.toLowerCase()))
    ? WEIGHT_PATH_CONTAINS_KEYWORD
    : 0;

  return keywordScore + pathBonus;
};

/**
 * 매칭들을 파일 단위로 묶어 점수를 매기고, 총 MAX_FILES_TOTAL개까지 상위 파일을 고른다.
 */
export const scoreCodeFiles = (matches: CodeMatch[]): ScoredCodeFile[] => {
  const matchesByPath = new Map<string, CodeMatch[]>();
  matches.forEach((match) => {
    const existing = matchesByPath.get(match.path) ?? [];
    existing.push(match);
    matchesByPath.set(match.path, existing);
  });

  const scoredFiles = [...matchesByPath.entries()].map(([filePath, fileMatches]) => ({
    path: filePath,
    score: getFileScore(filePath, fileMatches),
    matchedKeywords: [...new Set(fileMatches.map((match) => match.keyword))],
    lines: fileMatches.map((match) => match.line).sort((a, b) => a - b),
  }));

  return scoredFiles
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_FILES_TOTAL);
};

const mergeLineRanges = (lines: number[], totalLines: number): Array<[number, number]> => {
  const ranges = lines.map((line): [number, number] => [
    Math.max(1, line - SNIPPET_CONTEXT_LINES),
    Math.min(totalLines, line + SNIPPET_CONTEXT_LINES),
  ]);

  const merged: Array<[number, number]> = [];
  ranges
    .sort((a, b) => a[0] - b[0])
    .forEach(([start, end]) => {
      const last = merged.at(-1);
      if (last && start <= last[1] + 1) {
        last[1] = Math.max(last[1], end);
        return;
      }
      merged.push([start, end]);
    });
  return merged;
};

const createGapMarkerLine = (gapStart: number, gapEnd: number): string => `⋯ (L${gapStart}-${gapEnd} 생략)`;

/**
 * 매칭 라인 주변 ±5줄을 합쳐 스니펫을 추출한다.
 * 떨어진(비연속) 구간이 여러 개면 각 줄에 실제 줄 번호를 붙이고, 구간 사이에는 생략 표시를 넣는다.
 * startLine/endLine은 첫 구간의 범위만 가리킨다 (링크·정렬 기준). 코드 줄 수는 파일당 최대 40줄로 자른다.
 */
export const extractSnippet = async (checkoutDir: string, scoredFile: ScoredCodeFile): Promise<CodeFileSnippet> => {
  const absolutePath = path.join(checkoutDir, scoredFile.path);
  const content = await readFile(absolutePath, 'utf-8');
  const fileLines = content.split('\n');

  const mergedRanges = mergeLineRanges(scoredFile.lines, fileLines.length);
  const [firstRangeStart, firstRangeEnd] = mergedRanges[0] ?? [1, 1];

  const snippetLines: string[] = [];
  let codeLineCount = 0;
  let previousRangeEnd: number | null = null;
  let segmentsIncluded = 0;

  for (const [rangeStart, rangeEnd] of mergedRanges) {
    if (codeLineCount >= MAX_SNIPPET_LINES_PER_FILE) {
      break;
    }

    const linesInRange = Array.from({ length: rangeEnd - rangeStart + 1 }, (_, offset) => rangeStart + offset).slice(
      0,
      MAX_SNIPPET_LINES_PER_FILE - codeLineCount,
    );
    if (linesInRange.length === 0) {
      break;
    }

    if (previousRangeEnd !== null) {
      snippetLines.push(createGapMarkerLine(previousRangeEnd + 1, rangeStart - 1));
    }
    linesInRange.forEach((lineNumber) => {
      snippetLines.push(`${lineNumber}: ${fileLines[lineNumber - 1] ?? ''}`);
    });

    codeLineCount += linesInRange.length;
    previousRangeEnd = rangeEnd;
    segmentsIncluded += 1;
  }

  return {
    path: scoredFile.path,
    score: scoredFile.score,
    snippet: snippetLines.join('\n'),
    startLine: firstRangeStart,
    endLine: firstRangeEnd,
    extraSegmentCount: Math.max(0, segmentsIncluded - 1),
  };
};

export const extractSnippets = async (checkoutDir: string, scoredFiles: ScoredCodeFile[]): Promise<CodeFileSnippet[]> =>
  Promise.all(scoredFiles.map((scoredFile) => extractSnippet(checkoutDir, scoredFile)));
