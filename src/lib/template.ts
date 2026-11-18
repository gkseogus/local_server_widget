import { KIND_COMMAND_PATTERNS, MAX_PORT, PORT_TOKEN, TEMPLATE_TOKEN_PATTERN } from "@/contents/settings";
import type { ProjectKindType } from "@/types/config";
import type { DraftFace } from "@/types/settings";

/** Rust config::local_url 과 같은 모양 */
export const localUrl = (port: number): string => `http://localhost:${port}`;

/**
 * 미리보기용 템플릿 치환. `{port}` → 자기 포트, `{이름.url}` → 같은 그룹 서비스 주소.
 * 모르는 토큰이나 포트가 비어 있는 경우는 그대로 둬서 화면에서 바로 눈에 띄게 한다.
 * `{constructor.url}`·`{__proto__.url}` 처럼 상속된 속성 이름은 서비스가 아니므로 자기 속성만 본다.
 */
export const resolveTemplate = (
  text: string,
  ownPort: number | null,
  groupPorts: Record<string, number | null>,
): string =>
  text.replace(TEMPLATE_TOKEN_PATTERN, (token: string, name: string, url: string | undefined) => {
    const groupPort = Object.prototype.hasOwnProperty.call(groupPorts, name) ? groupPorts[name] : null;
    const port = url ? groupPort : name === PORT_TOKEN ? ownPort : null;
    if (port === null || port === undefined) return token;
    return url ? localUrl(port) : String(port);
  });

/** preferred 부터 올라가며 설정 전체에서 아직 안 쓰는 첫 포트. 다 찼으면 null. */
export const nextFreePort = (draft: DraftFace, preferred: number): number | null => {
  const used = new Set(draft.groups.flatMap((group) => group.services.map((service) => service.port)));
  for (let port = preferred; port <= MAX_PORT; port += 1) {
    if (!used.has(port)) return port;
  }
  return null;
};

/** 실행 명령으로 프로젝트 종류를 짐작한다 (배지 표시용, IPC 없이). */
export const inferKind = (command: string): ProjectKindType =>
  KIND_COMMAND_PATTERNS.find(([, pattern]) => pattern.test(command))?.[0] ?? "unknown";
