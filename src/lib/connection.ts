import type { ProjectKindType } from "@/types/config";
import { API_REF_PATTERN, URL_REF_PATTERN } from "@/contents/settings";
import type { ApiConnectionFace, CorsConnectionFace, EnvRowFace } from "@/types/settings";

/** `{이름.url}` */
export const urlRef = (name: string): string => `{${name}.url}`;

/** `{이름.url}` + 경로 (예: `{backend.url}/api`) */
export const apiRef = (name: string, path: string): string => `${urlRef(name)}${path}`;

/** `{a.url},{b.url}` */
export const corsValue = (frontends: string[]): string => frontends.map(urlRef).join(",");

// Rust detect_project 의 corsEnvKeys 와 같은 기준
const isCorsKey = (key: string): boolean => key.includes("CORS") || key.endsWith("ALLOWED_ORIGINS");

const refName = (text: string): string | null => URL_REF_PATTERN.exec(text.trim())?.[1] ?? null;

/** 값이 `{a.url}` 또는 `{a.url},{b.url}` 꼴이면 이름 목록, 아니면 null */
const refList = (value: string): string[] | null => {
  const names = value.split(",").map(refName);
  return names.every((name): name is string => name !== null) ? names : null;
};

/**
 * env 에서 "API 를 보낼 백엔드" 를 역으로 읽는다: CORS 이름이 아닌 키 중 값이 `{형제.url}` 또는
 * `{형제.url}/경로` 인 것. 여러 백엔드·경로를 가리키면 처음 나온 것을 고르고, 같은 백엔드·같은 경로인 키만 묶는다.
 * ponytail: CORS 이름이 아닌 키에 프론트 하나만 넣으면 API 연결로 읽힌다 — 키 이름 말고는 구분할 단서가 없다.
 */
export const readApiConnection = (env: EnvRowFace[], siblings: string[]): ApiConnectionFace => {
  const refOf = (row: EnvRowFace): { backend: string; path: string } | null => {
    const match = isCorsKey(row.key) ? null : API_REF_PATTERN.exec(row.value.trim());
    return match && siblings.includes(match[1]) ? { backend: match[1], path: match[2] ?? "" } : null;
  };
  const first = env.map(refOf).find((ref) => ref !== null) ?? null;
  if (!first) return { backend: null, keys: [], path: "" };
  const same = (row: EnvRowFace): boolean => {
    const ref = refOf(row);
    return ref !== null && ref.backend === first.backend && ref.path === first.path;
  };
  return { backend: first.backend, keys: env.filter(same).map((row) => row.key), path: first.path };
};

/** env 에서 "접속을 허용할 프론트" 를 역으로 읽는다: CORS 이름이거나 여러 개를 쉼표로 이은 형제 주소 목록. */
export const readCorsConnection = (env: EnvRowFace[], siblings: string[]): CorsConnectionFace => {
  for (const row of env) {
    const names = refList(row.value);
    if (names && names.every((name) => siblings.includes(name)) && (isCorsKey(row.key) || names.length > 1)) {
      return { key: row.key, frontends: names };
    }
  }
  return { key: null, frontends: [] };
};

/** 같은 이름이 있으면 그 자리에서 값만 바꾸고, 없으면 끝에 붙인다. */
export const setEnvVar = (env: EnvRowFace[], key: string, value: string): EnvRowFace[] =>
  env.some((row) => row.key === key)
    ? env.map((row) => (row.key === key ? { ...row, value } : row))
    : [...env, { key, value }];

export const removeEnvVars = (env: EnvRowFace[], keys: string[]): EnvRowFace[] =>
  env.filter((row) => !keys.includes(row.key));

export const renameEnvVar = (env: EnvRowFace[], from: string, to: string): EnvRowFace[] =>
  env.map((row) => (row.key === from ? { ...row, key: to } : row));

/** 백엔드를 고르면 각 변수 = `{백엔드.url}` + 경로, "연결 안 함" 이면 이전에 연결했던 변수를 지운다. */
export const writeApiConnection = (
  env: EnvRowFace[],
  previous: ApiConnectionFace,
  backend: string | null,
  keys: string[],
  path: string,
): EnvRowFace[] =>
  backend
    ? keys.reduce((rows, key) => setEnvVar(rows, key, apiRef(backend, path)), env)
    : removeEnvVars(env, previous.keys);

/** 체크한 프론트가 있으면 `key = {a.url},{b.url}`, 없으면 그 변수를 지운다. */
export const writeCorsConnection = (env: EnvRowFace[], key: string, frontends: string[]): EnvRowFace[] =>
  frontends.length > 0 ? setEnvVar(env, key, corsValue(frontends)) : removeEnvVars(env, [key]);

/**
 * 서버 종류에 맞는 연결 칸만 보여 준다. 백엔드(FastAPI)는 CORS 만, 프론트(Next·Vite)는 API 백엔드만.
 * 종류를 모르거나 env 에 이미 그 관계가 있으면(손으로 설정한 경우) 숨기지 않는다.
 */
export const visibleConnections = (
  kind: ProjectKindType | null,
  api: ApiConnectionFace,
  cors: CorsConnectionFace,
): { api: boolean; cors: boolean } => {
  const known = kind ?? "unknown";
  return {
    api: known !== "fastapi" || api.backend !== null,
    cors: known === "fastapi" || known === "unknown" || cors.frontends.length > 0,
  };
};
