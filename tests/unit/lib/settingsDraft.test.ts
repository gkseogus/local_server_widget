import { describe, expect, it } from "vitest";
import {
  addGroup,
  addService,
  addServiceFromFolder,
  applyDetection,
  countChanges,
  fallbackProjectInfo,
  fromDraft,
  removeGroup,
  removeService,
  resolveSelection,
  toDraft,
  updateGroup,
  updateService,
} from "@/lib/settingsDraft";
import type { DraftFace, DraftServiceFace } from "@/types/settings";
import { makeAcmeConfig, makeProjectInfo } from "@tests/helpers/fixtures";

const newService = (overrides: Partial<DraftServiceFace> = {}): DraftServiceFace => ({
  name: "worker",
  cwd: "~/Desktop/acme_worker",
  port: 9000,
  command: "python worker.py",
  env: [],
  ...overrides,
});

const acme = (): DraftFace => toDraft(makeAcmeConfig());

describe("toDraft / fromDraft", () => {
  it("env 를 행으로 바꿨다가 그대로 되돌린다", () => {
    const draft = acme();
    expect(draft.groups[0].services[0].env).toEqual([{ key: "CORS_ORIGINS", value: "{frontend.url},{admin.url}" }]);
    expect(fromDraft(draft)).toEqual(makeAcmeConfig());
  });
});

describe("불변 편집", () => {
  it.each([
    ["addGroup", (d: DraftFace) => addGroup(d, { name: "blog", services: [] })],
    ["updateGroup", (d: DraftFace) => updateGroup(d, 0, { name: "renamed" })],
    ["removeGroup", (d: DraftFace) => removeGroup(d, 0)],
    ["addService", (d: DraftFace) => addService(d, 0, newService())],
    ["updateService", (d: DraftFace) => updateService(d, 0, 1, { port: 3200 })],
    ["removeService", (d: DraftFace) => removeService(d, 0, 1)],
  ])("%s 는 원본을 바꾸지 않는다", (_label: string, edit: (d: DraftFace) => DraftFace) => {
    const draft = acme();
    const snapshot = structuredClone(draft);
    expect(edit(draft)).not.toEqual(snapshot);
    expect(draft).toEqual(snapshot);
  });

  it("각 편집이 해당 위치만 바꾼다", () => {
    const draft = acme();
    expect(updateService(draft, 0, 1, { port: 3200 }).groups[0].services.map((s) => s.port)).toEqual([8002, 3200, 5173]);
    expect(removeService(draft, 0, 0).groups[0].services.map((s) => s.name)).toEqual(["frontend", "admin"]);
    expect(addService(draft, 0, newService()).groups[0].services[3].name).toBe("worker");
    expect(updateGroup(draft, 0, { name: "renamed" }).groups[0].name).toBe("renamed");
    expect(removeGroup(draft, 0).groups).toEqual([]);
  });
});

describe("addServiceFromFolder", () => {
  it("제안된 그룹이 없으면 새 프로젝트를 만들고 그 서버를 선택한다", () => {
    const result = addServiceFromFolder({ groups: [] }, "~/Desktop/shop_backend", makeProjectInfo({ suggestedGroup: "shop" }), null);
    expect(result.draft.groups).toEqual([
      {
        name: "shop",
        services: [
          {
            name: "backend",
            cwd: "~/Desktop/shop_backend",
            port: 8000,
            command: ".venv/bin/uvicorn app.main:app --reload --port {port}",
            env: [],
          },
        ],
      },
    ]);
    expect(result.selection).toEqual({ group: 0, service: 0 });
  });

  it("같은 이름(대소문자 무시)의 프로젝트가 있으면 거기에 더하고, 쓰는 포트는 피한다", () => {
    const info = makeProjectInfo({ suggestedGroup: "AcMe", suggestedName: "admin2", kind: "vite", defaultPort: 5173 });
    const result = addServiceFromFolder(acme(), "~/Desktop/acme_admin2", info, null);
    expect(result.draft.groups).toHaveLength(1);
    expect(result.draft.groups[0].services[3]).toMatchObject({ name: "admin2", port: 5174 });
    expect(result.selection).toEqual({ group: 0, service: 3 });
  });

  it("그룹을 지정하면 제안과 상관없이 그 그룹에 넣는다", () => {
    const base = addGroup(acme(), { name: "blog", services: [] });
    const result = addServiceFromFolder(base, "~/x", makeProjectInfo({ suggestedGroup: "acme" }), 1);
    expect(result.draft.groups[1].services).toHaveLength(1);
    expect(result.selection).toEqual({ group: 1, service: 0 });
  });

  it("감지 못 한 폴더는 명령·포트를 비워 둔다", () => {
    const result = addServiceFromFolder({ groups: [] }, "~/Desktop/notes/", fallbackProjectInfo("~/Desktop/notes/"), null);
    expect(result.draft.groups[0]).toEqual({
      name: "notes",
      services: [{ name: "notes", cwd: "~/Desktop/notes/", port: null, command: "", env: [] }],
    });
  });
});

describe("applyDetection", () => {
  it("비어 있는 이름·명령·포트만 감지값으로 채운다", () => {
    const draft = addService(acme(), 0, newService({ name: "", command: " ", port: null }));
    const next = applyDetection(draft, 0, 3, makeProjectInfo({ suggestedName: "api", defaultPort: 8002 }));
    expect(next.groups[0].services[3]).toMatchObject({
      name: "api",
      command: ".venv/bin/uvicorn app.main:app --reload --port {port}",
      // 8002 는 backend 가 쓰므로 다음 빈 번호
      port: 8003,
    });
  });

  it("사용자가 이미 쓴 값은 덮어쓰지 않는다", () => {
    const draft = addService(acme(), 0, newService({ name: "my-worker", command: "run", port: 9100 }));
    const next = applyDetection(draft, 0, 3, makeProjectInfo());
    expect(next.groups[0].services[3]).toMatchObject({ name: "my-worker", command: "run", port: 9100 });
  });
});

describe("resolveSelection", () => {
  const draft = addGroup(acme(), { name: "empty", services: [] });

  it.each([
    ["유효한 서비스 선택은 그대로", { group: 0, service: 2 }, { group: 0, service: 2 }],
    ["유효한 그룹 선택은 그대로", { group: 1, service: null }, { group: 1, service: null }],
    ["사라진 서비스면 그 그룹", { group: 0, service: 5 }, { group: 0, service: null }],
    ["사라진 그룹이면 첫 서비스", { group: 9, service: 0 }, { group: 0, service: 0 }],
    ["선택이 없으면 첫 서비스", null, { group: 0, service: 0 }],
  ])("%s", (_label: string, selection: { group: number; service: number | null } | null, expected: unknown) => {
    expect(resolveSelection(draft, selection)).toEqual(expected);
  });

  it("그룹이 없으면 null (빈 상태)", () => {
    expect(resolveSelection({ groups: [] }, { group: 0, service: 0 })).toBeNull();
  });

  it("첫 그룹에 서버가 없으면 그 그룹", () => {
    expect(resolveSelection({ groups: [{ name: "a", services: [] }] }, null)).toEqual({ group: 0, service: null });
  });
});

describe("countChanges", () => {
  const base = acme();

  it.each([
    ["변경 없음", (d: DraftFace) => d, 0],
    ["포트 하나 수정", (d: DraftFace) => updateService(d, 0, 1, { port: 3200 }), 1],
    ["두 서버 수정", (d: DraftFace) => updateService(updateService(d, 0, 1, { port: 3200 }), 0, 2, { name: "adm" }), 2],
    ["첫 서버 삭제 (뒤 서버는 그대로)", (d: DraftFace) => removeService(d, 0, 0), 1],
    ["서버 추가", (d: DraftFace) => addService(d, 0, newService()), 1],
    ["프로젝트 이름 변경", (d: DraftFace) => updateGroup(d, 0, { name: "mq" }), 1],
    ["프로젝트 추가", (d: DraftFace) => addGroup(d, { name: "blog", services: [newService()] }), 1],
    ["env 순서만 바뀜", (d: DraftFace) => updateService(d, 0, 1, { env: [...d.groups[0].services[1].env].reverse() }), 0],
    ["고쳤다가 원래대로", (d: DraftFace) => updateService(updateService(d, 0, 0, { port: 1 }), 0, 0, { port: 8002 }), 0],
  ])("%s → %i건", (_label: string, edit: (d: DraftFace) => DraftFace, expected: number) => {
    expect(countChanges(base, edit(base))).toBe(expected);
  });
});
