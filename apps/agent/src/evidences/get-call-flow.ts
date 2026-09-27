import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getCodeMatches } from './get-code-matches';
import type { RepositoryKey } from './target-repositories';

type JavaLayer = 'controller' | 'service' | 'repository' | 'entity' | 'unknown';

const JAVA_LAYER_SEGMENTS: Record<Exclude<JavaLayer, 'unknown'>, string> = {
  controller: 'controller',
  service: 'service',
  repository: 'repository',
  entity: 'entity',
};

const getJavaLayer = (filePath: string): JavaLayer => {
  const normalizedPath = filePath.toLowerCase();
  const match = (Object.entries(JAVA_LAYER_SEGMENTS) as Array<[Exclude<JavaLayer, 'unknown'>, string]>).find(
    ([, segment]) => normalizedPath.includes(`/${segment}/`),
  );
  return match ? match[0] : 'unknown';
};

const JAVA_CLASS_SUFFIXES = ['ServiceImpl', 'Controller', 'Service', 'Repository'];

// "NoticeController" -> "Notice", "NoticeServiceImpl" -> "Notice" (긴 접미사부터 매칭해 ServiceImpl을 Service보다 우선한다)
const getDomainPrefix = (className: string): string => {
  const suffix = JAVA_CLASS_SUFFIXES.find((candidate) => className.endsWith(candidate));
  return suffix ? className.slice(0, className.length - suffix.length) : className;
};

const readFileSafely = async (filePath: string): Promise<string | null> => {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
};

const findFileContainingClass = async (checkoutDir: string, classNamePattern: string): Promise<string | null> => {
  const matches = await getCodeMatches([classNamePattern], checkoutDir);
  const definitionMatch = matches.find((match) => /\b(class|interface)\b/.test(match.text));
  return definitionMatch?.path ?? matches[0]?.path ?? null;
};

/**
 * Java 클래스 경로에서 Controller → Service → Repository 참조 체인을 추정한다.
 * 각 단계는 "다음 계층 클래스명이 실제로 파일 내용에 등장하는지"로 검증하며, 확인되지 않으면 빈 배열을 반환한다.
 */
export const getServerCallFlow = async (matchedFilePath: string, checkoutDir: string): Promise<string[]> => {
  const className = path.basename(matchedFilePath, '.java');
  const layer = getJavaLayer(matchedFilePath);
  if (layer === 'unknown' || layer === 'entity') {
    return [];
  }
  const domain = getDomainPrefix(className);
  if (!domain) {
    return [];
  }

  const controllerClassName = `${domain}Controller`;
  const serviceClassName = `${domain}Service`;
  const repositoryClassName = `${domain}Repository`;

  const controllerPath =
    layer === 'controller' ? matchedFilePath : await findFileContainingClass(checkoutDir, `class ${controllerClassName}`);
  const servicePath = await findFileContainingClass(checkoutDir, `${domain}Service`);
  const repositoryPath = await findFileContainingClass(checkoutDir, `${domain}Repository`);

  if (!controllerPath || !servicePath || !repositoryPath) {
    return [];
  }

  const controllerContent = await readFileSafely(path.join(checkoutDir, controllerPath));
  const serviceContent = await readFileSafely(path.join(checkoutDir, servicePath));

  const isControllerReferencingService = controllerContent?.includes(serviceClassName) ?? false;
  const isServiceReferencingRepository = serviceContent?.includes(repositoryClassName) ?? false;

  if (!isControllerReferencingService || !isServiceReferencingRepository) {
    return [];
  }

  return [controllerClassName, serviceClassName, repositoryClassName];
};

const CLIENT_MODULE_SEGMENT_PATTERN = /(entities|features)\/[^/]+/;
const CLIENT_IMPORTER_DIR_SEGMENTS = ['pages', 'app'];

/**
 * entities/ 또는 features/ 하위 모듈 파일에서, 그 모듈을 import하는 pages/ 또는 app/(라우트) 파일을 찾는다.
 * 찾으면 [importer file, module file] 체인을, 없으면 빈 배열을 반환한다.
 */
export const getClientCallFlow = async (matchedFilePath: string, checkoutDir: string): Promise<string[]> => {
  const normalizedPath = matchedFilePath.replace(/\\/g, '/');
  const segmentMatch = normalizedPath.match(CLIENT_MODULE_SEGMENT_PATTERN);
  if (!segmentMatch) {
    return [];
  }
  const moduleSegment = segmentMatch[0];

  const matches = await getCodeMatches([moduleSegment], checkoutDir);
  const importerMatch = matches.find((match) => {
    const normalizedMatchPath = match.path.replace(/\\/g, '/');
    return CLIENT_IMPORTER_DIR_SEGMENTS.some(
      (segment) => normalizedMatchPath.startsWith(`${segment}/`) || normalizedMatchPath.includes(`/${segment}/`),
    );
  });

  if (!importerMatch) {
    return [];
  }

  return [importerMatch.path, matchedFilePath];
};

/** 저장소 종류에 따라 서버/클라이언트 호출 흐름 추적 함수로 분기한다. */
export const getCallFlow = (repositoryKey: RepositoryKey, matchedFilePath: string, checkoutDir: string): Promise<string[]> =>
  repositoryKey === 'server' ? getServerCallFlow(matchedFilePath, checkoutDir) : getClientCallFlow(matchedFilePath, checkoutDir);
