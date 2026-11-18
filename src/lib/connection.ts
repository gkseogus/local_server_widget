import type { ProjectKindType } from "@/types/config";
import { URL_REF_PATTERN } from "@/contents/settings";
import type { ApiConnectionFace, CorsConnectionFace, EnvRowFace } from "@/types/settings";

/** `{이름.url}` */
export const urlRef = (name: string): string => `{${name}.url}`;

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
 * env 에서 "API 를 보낼 백엔드" 를 역으로 읽는다: CORS 이름이 아닌 키 중 값이 정확히 `{형제.url}` 인 것.
 * 여러 백엔드를 가리키면 처음 나온 것을 고른다.
 * ponytail: CORS 이름이 아닌 키에 프론트 하나만 넣으면 API 연결로 읽힌다 — 키 이름 말고는 구분할 단서가 없다.
 */
export const readApiConnection = (env: EnvRowFace[], siblings: string[]): ApiConnectionFace => {
  const backendOf = (row: EnvRowFace): string | null => {
    const name = isCorsKey(row.key) ? null : refName(row.value);
    return name !== null && row.value === urlRef(name) && siblings.includes(name) ? name : null;
  };
  const backend = env.map(backendOf).find((name) => name !== null) ?? null;
  return { backend, keys: backend ? env.filter((row) => backendOf(row) === backend).map((row) => row.key) : [] };
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

/** 백엔드를 고르면 각 변수 = `{백엔드.url}`, "연결 안 함" 이면 이전에 연결했던 변수를 지운다. */
export const writeApiConnection = (
  env: EnvRowFace[],
  previous: ApiConnectionFace,
  backend: string | null,
  keys: string[],
): EnvRowFace[] =>
  backend
    ? keys.reduce((rows, key) => setEnvVar(rows, key, urlRef(backend)), env)
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
