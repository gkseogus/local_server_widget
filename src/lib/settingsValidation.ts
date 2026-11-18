import {
  ENV_KEY_PATTERN,
  MAX_PORT,
  PORT_TOKEN,
  SERVICE_NAME_PATTERN,
  TEMPLATE_TOKEN_PATTERN,
  VALIDATION_TEXT,
} from "@/contents/settings";
import type { DraftFace, SelectionFace, ValidationIssueFace } from "@/types/settings";

// Rust config::parse_and_resolve 의 검사 중 폴더 존재를 뺀 것을 저장 전에 미리 잡는다.
// 폴더 문제는 저장 때 Rust 가 돌려준 줄 목록으로 보여 준다.

const isPathSegment = (name: string): boolean => !name.includes("/") && name !== "." && name !== "..";

const isServiceName = (name: string): boolean => SERVICE_NAME_PATTERN.test(name);

/** 이름 문제를 돌려준다. 통과하면 seen 에 소문자로 넣는다 (대소문자만 다른 이름은 로그 파일이 겹친다). */
const nameProblem = (
  name: string,
  seen: Set<string>,
  duplicateMessage: string,
  isValid: (name: string) => boolean,
  invalidMessage: string,
): string | null => {
  if (!name.trim()) return VALIDATION_TEXT.nameEmpty;
  if (!isValid(name)) return invalidMessage;
  if (seen.has(name.toLowerCase())) return duplicateMessage;
  seen.add(name.toLowerCase());
  return null;
};

/** Rust config::render 와 같은 규칙: `{port}`, `{같은 그룹 서비스.url}` 만 허용 */
const templateProblem = (text: string, siblings: Set<string>): string | null => {
  for (const [token, name, url] of text.matchAll(TEMPLATE_TOKEN_PATTERN)) {
    if (url && !siblings.has(name)) return `${token}: ${VALIDATION_TEXT.templateNoService}`;
    if (!url && name !== PORT_TOKEN) return `${token}: ${VALIDATION_TEXT.templateUnknown}`;
  }
  return null;
};

const envKeyProblem = (key: string, seen: Set<string>): string | null => {
  if (!key) return VALIDATION_TEXT.envKeyEmpty;
  if (!ENV_KEY_PATTERN.test(key)) return VALIDATION_TEXT.envKeyInvalid;
  if (seen.has(key)) return VALIDATION_TEXT.envKeyDuplicate;
  seen.add(key);
  return null;
};

export const validateDraft = (draft: DraftFace): ValidationIssueFace[] => {
  const issues: ValidationIssueFace[] = [];

  // 포트 → 그 포트를 쓰는 서비스들 (그룹을 가로질러)
  const portOwners = new Map<number, { group: number; service: number; label: string }[]>();
  draft.groups.forEach((group, gi) =>
    group.services.forEach((service, si) => {
      if (service.port === null) return;
      const owners = portOwners.get(service.port) ?? [];
      owners.push({ group: gi, service: si, label: `${group.name}/${service.name}` });
      portOwners.set(service.port, owners);
    }),
  );

  const groupNames = new Set<string>();
  draft.groups.forEach((group, gi) => {
    const groupProblem = nameProblem(
      group.name,
      groupNames,
      VALIDATION_TEXT.groupDuplicate,
      isPathSegment,
      VALIDATION_TEXT.nameInvalid,
    );
    if (groupProblem) issues.push({ group: gi, service: null, field: "name", message: groupProblem });

    const serviceNames = new Set<string>();
    const siblings = new Set(group.services.map((service) => service.name));
    group.services.forEach((service, si) => {
      const push = (field: ValidationIssueFace["field"], message: string, envIndex?: number): void => {
        issues.push({ group: gi, service: si, field, message, envIndex });
      };

      const nameIssue = nameProblem(
        service.name,
        serviceNames,
        VALIDATION_TEXT.serviceDuplicate,
        isServiceName,
        VALIDATION_TEXT.serviceNameInvalid,
      );
      if (nameIssue) push("name", nameIssue);

      if (service.port === null) {
        push("port", VALIDATION_TEXT.portEmpty);
      } else if (!Number.isInteger(service.port) || service.port < 1 || service.port > MAX_PORT) {
        push("port", VALIDATION_TEXT.portRange);
      } else {
        const others = (portOwners.get(service.port) ?? []).filter(
          (owner) => owner.group !== gi || owner.service !== si,
        );
        if (others.length > 0) {
          push("port", `${others.map((owner) => `‘${owner.label}’`).join(", ")} ${VALIDATION_TEXT.portDuplicateSuffix}`);
        }
      }

      if (!service.cwd.trim()) push("cwd", VALIDATION_TEXT.cwdEmpty);
      const commandIssue = service.command.trim()
        ? templateProblem(service.command, siblings)
        : VALIDATION_TEXT.commandEmpty;
      if (commandIssue) push("command", commandIssue);

      const envKeys = new Set<string>();
      service.env.forEach((row, ri) => {
        const envIssue = envKeyProblem(row.key, envKeys) ?? templateProblem(row.value, siblings);
        if (envIssue) push("env", envIssue, ri);
      });
    });
  });

  return issues;
};

/** 오류가 있는 위치(그룹/서비스)를 처음 나온 순서대로, 중복 없이. */
export const issueLocations = (issues: ValidationIssueFace[]): SelectionFace[] =>
  issues.reduce<SelectionFace[]>((locations, issue) => {
    const exists = locations.some((loc) => loc.group === issue.group && loc.service === issue.service);
    return exists ? locations : [...locations, { group: issue.group, service: issue.service }];
  }, []);

/** "고칠 곳" 을 누를 때마다 현재 위치 다음 오류 위치로 (끝이면 처음으로). */
export const nextIssueLocation = (
  issues: ValidationIssueFace[],
  current: SelectionFace | null,
): SelectionFace | null => {
  const locations = issueLocations(issues);
  if (locations.length === 0) return null;
  const index = locations.findIndex((loc) => loc.group === current?.group && loc.service === current?.service);
  return locations[(index + 1) % locations.length];
};
