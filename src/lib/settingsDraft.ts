import { nextFreePort } from "@/lib/template";
import type { ConfigFace, ProjectInfoFace } from "@/types/config";
import type { DraftFace, DraftGroupFace, DraftServiceFace, SelectionFace } from "@/types/settings";

// 모든 편집 함수는 불변: 새 DraftFace 를 돌려주고 인자는 건드리지 않는다.

export const toDraft = (config: ConfigFace): DraftFace => ({
  groups: config.groups.map((group) => ({
    name: group.name,
    services: group.services.map((service) => ({
      ...service,
      env: Object.entries(service.env).map(([key, value]) => ({ key, value })),
    })),
  })),
});

/** 저장할 services.json 구조. 검증을 통과한 draft 에서만 부른다 (빈 포트는 0 → Rust 가 거부). */
export const fromDraft = (draft: DraftFace): ConfigFace => ({
  groups: draft.groups.map((group) => ({
    name: group.name,
    services: group.services.map((service) => ({
      name: service.name,
      cwd: service.cwd,
      port: service.port ?? 0,
      command: service.command,
      env: Object.fromEntries(service.env.map((row) => [row.key, row.value])),
    })),
  })),
});

const replaceAt = <T>(items: T[], index: number, next: T): T[] =>
  items.map((item, i) => (i === index ? next : item));

export const addGroup = (draft: DraftFace, group: DraftGroupFace): DraftFace => ({
  groups: [...draft.groups, group],
});

export const updateGroup = (draft: DraftFace, groupIndex: number, patch: Partial<DraftGroupFace>): DraftFace => ({
  groups: replaceAt(draft.groups, groupIndex, { ...draft.groups[groupIndex], ...patch }),
});

export const removeGroup = (draft: DraftFace, groupIndex: number): DraftFace => ({
  groups: draft.groups.filter((_, i) => i !== groupIndex),
});

export const addService = (draft: DraftFace, groupIndex: number, service: DraftServiceFace): DraftFace =>
  updateGroup(draft, groupIndex, { services: [...draft.groups[groupIndex].services, service] });

export const updateService = (
  draft: DraftFace,
  groupIndex: number,
  serviceIndex: number,
  patch: Partial<DraftServiceFace>,
): DraftFace => {
  const services = draft.groups[groupIndex].services;
  return updateGroup(draft, groupIndex, {
    services: replaceAt(services, serviceIndex, { ...services[serviceIndex], ...patch }),
  });
};

export const removeService = (draft: DraftFace, groupIndex: number, serviceIndex: number): DraftFace =>
  updateGroup(draft, groupIndex, {
    services: draft.groups[groupIndex].services.filter((_, i) => i !== serviceIndex),
  });

/** detect_project 가 실패했을 때 쓸 값: 폴더 이름만 제안한다. */
export const fallbackProjectInfo = (cwd: string): ProjectInfoFace => ({
  kind: "unknown",
  suggestedGroup: null,
  suggestedName: cwd.replace(/\/+$/, "").split("/").pop() ?? "",
  command: null,
  defaultPort: null,
  apiEnvKeys: [],
  corsEnvKeys: [],
});

/**
 * 고른 폴더와 감지 결과로 서비스를 하나 만든다.
 * groupIndex 가 null 이면 제안된 그룹 이름(없으면 폴더 이름)과 같은 프로젝트에 넣고, 없으면 새 프로젝트를 만든다.
 */
export const addServiceFromFolder = (
  draft: DraftFace,
  cwd: string,
  info: ProjectInfoFace,
  groupIndex: number | null,
): { draft: DraftFace; selection: SelectionFace } => {
  const groupName = info.suggestedGroup ?? info.suggestedName;
  const existing = draft.groups.findIndex((group) => group.name.toLowerCase() === groupName.toLowerCase());
  const target = groupIndex ?? (existing >= 0 ? existing : draft.groups.length);
  const base = target < draft.groups.length ? draft : addGroup(draft, { name: groupName, services: [] });
  const service: DraftServiceFace = {
    name: info.suggestedName,
    cwd,
    port: info.defaultPort === null ? null : nextFreePort(draft, info.defaultPort),
    command: info.command ?? "",
    env: [],
  };
  return {
    draft: addService(base, target, service),
    selection: { group: target, service: base.groups[target].services.length },
  };
};

/** 폴더를 다시 고른 뒤 감지값으로 빈 칸만 채운다. 사용자가 이미 쓴 이름·명령·포트는 그대로 둔다. */
export const applyDetection = (
  draft: DraftFace,
  groupIndex: number,
  serviceIndex: number,
  info: ProjectInfoFace,
): DraftFace => {
  const service = draft.groups[groupIndex].services[serviceIndex];
  return updateService(draft, groupIndex, serviceIndex, {
    name: service.name.trim() ? service.name : info.suggestedName,
    command: service.command.trim() ? service.command : (info.command ?? ""),
    port: service.port ?? (info.defaultPort === null ? null : nextFreePort(draft, info.defaultPort)),
  });
};

/** 선택이 사라진 항목을 가리키면 가까운 곳으로 옮긴다. 그룹이 없으면 null(빈 상태). */
export const resolveSelection = (draft: DraftFace, selection: SelectionFace | null): SelectionFace | null => {
  const group = selection ? draft.groups[selection.group] : undefined;
  if (selection && group) {
    const hasService = selection.service !== null && selection.service < group.services.length;
    return hasService ? selection : { group: selection.group, service: null };
  }
  if (draft.groups.length === 0) return null;
  return { group: 0, service: draft.groups[0].services.length > 0 ? 0 : null };
};

// env 순서는 저장 시 Rust(BTreeMap)가 정렬하므로 비교에서 무시한다.
const serviceKey = (service: DraftServiceFace): string =>
  JSON.stringify([
    service.name,
    service.cwd,
    service.port,
    service.command,
    service.env.map((row) => `${row.key}=${row.value}`).sort(),
  ]);

// 같은 서비스끼리 짝지어 남는 쪽 개수. 수정 1개 = 양쪽에 1개씩 남으므로 큰 쪽을 센다.
const countServiceChanges = (base: DraftServiceFace[], next: DraftServiceFace[]): number => {
  const remaining = base.map(serviceKey);
  let added = 0;
  for (const key of next.map(serviceKey)) {
    const index = remaining.indexOf(key);
    if (index === -1) added += 1;
    else remaining.splice(index, 1);
  }
  return Math.max(added, remaining.length);
};

/**
 * 저장하지 않은 변경 건수 (추가·수정·삭제한 서버와 프로젝트 수).
 * ponytail: 프로젝트는 순서로 짝짓는다 — 가운데 프로젝트를 지우면 뒤 프로젝트까지 변경으로 센다.
 */
export const countChanges = (base: DraftFace, next: DraftFace): number => {
  let count = 0;
  for (let i = 0; i < Math.max(base.groups.length, next.groups.length); i += 1) {
    const before = base.groups[i];
    const after = next.groups[i];
    if (!before || !after) {
      count += 1;
      continue;
    }
    if (before.name !== after.name) count += 1;
    count += countServiceChanges(before.services, after.services);
  }
  return count;
};
