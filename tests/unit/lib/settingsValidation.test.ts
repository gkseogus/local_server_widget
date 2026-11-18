import { describe, expect, it } from "vitest";
import { VALIDATION_TEXT } from "@/contents/settings";
import { addGroup, toDraft, updateGroup, updateService } from "@/lib/settingsDraft";
import { issueLocations, nextIssueLocation, validateDraft } from "@/lib/settingsValidation";
import type { DraftFace, DraftServiceFace, ValidationIssueFace } from "@/types/settings";
import { makeAcmeConfig } from "@tests/helpers/fixtures";

const acme = (): DraftFace => toDraft(makeAcmeConfig());
const editFrontend = (patch: Partial<DraftServiceFace>): DraftFace => updateService(acme(), 0, 1, patch);

describe("validateDraft", () => {
  it("README 예시 설정은 문제가 없다", () => {
    expect(validateDraft(acme())).toEqual([]);
  });

  it.each([
    ["빈 이름", "", VALIDATION_TEXT.nameEmpty],
    ["공백뿐인 이름", "  ", VALIDATION_TEXT.nameEmpty],
    ["/ 가 든 이름", "a/b", VALIDATION_TEXT.serviceNameInvalid],
    [". 이름", ".", VALIDATION_TEXT.serviceNameInvalid],
    [".. 이름", "..", VALIDATION_TEXT.serviceNameInvalid],
    // {이름.url} 템플릿으로 인식되지 않는 이름 (Rust 템플릿 식별자 규칙)
    ["공백이 든 이름", "my api", VALIDATION_TEXT.serviceNameInvalid],
    ["한글 이름", "백엔드", VALIDATION_TEXT.serviceNameInvalid],
    ["대소문자만 다른 중복", "Backend", VALIDATION_TEXT.serviceDuplicate],
  ])("서비스 %s → 이름 오류", (_label: string, name: string, message: string) => {
    expect(validateDraft(editFrontend({ name }))).toContainEqual(
      expect.objectContaining({ group: 0, service: 1, field: "name", message }),
    );
  });

  it("프로젝트 이름도 같은 규칙, 중복은 대소문자 무시", () => {
    const draft = addGroup(acme(), { name: "ACME", services: [] });
    expect(validateDraft(draft)).toEqual([
      { group: 1, service: null, field: "name", message: VALIDATION_TEXT.groupDuplicate },
    ]);
    expect(validateDraft(updateGroup(acme(), 0, { name: "a/b" }))).toEqual([
      { group: 0, service: null, field: "name", message: VALIDATION_TEXT.nameInvalid },
    ]);
  });

  it("다른 프로젝트에서는 같은 서버 이름을 써도 된다", () => {
    const draft = addGroup(acme(), {
      name: "blog",
      services: [{ ...acme().groups[0].services[0], port: 8100, env: [] }],
    });
    expect(validateDraft(draft)).toEqual([]);
  });

  it.each([
    ["비어 있음", null, VALIDATION_TEXT.portEmpty],
    ["0", 0, VALIDATION_TEXT.portRange],
    ["65535 초과", 70000, VALIDATION_TEXT.portRange],
  ])("포트 %s → 오류", (_label: string, port: number | null, message: string) => {
    expect(validateDraft(editFrontend({ port }))).toEqual([{ group: 0, service: 1, field: "port", message }]);
  });

  it("겹치는 포트는 프로젝트를 가로질러 양쪽 모두에 상대 서버를 알려 준다", () => {
    const draft = addGroup(acme(), {
      name: "blog",
      services: [{ name: "api", cwd: "~/blog", port: 8002, command: "run", env: [] }],
    });
    expect(validateDraft(draft)).toEqual([
      { group: 0, service: 0, field: "port", message: `‘blog/api’ ${VALIDATION_TEXT.portDuplicateSuffix}` },
      { group: 1, service: 0, field: "port", message: `‘acme/backend’ ${VALIDATION_TEXT.portDuplicateSuffix}` },
    ]);
  });

  it("빈 폴더·빈 명령", () => {
    expect(validateDraft(editFrontend({ cwd: "", command: "   " }))).toEqual([
      { group: 0, service: 1, field: "cwd", message: VALIDATION_TEXT.cwdEmpty },
      { group: 0, service: 1, field: "command", message: VALIDATION_TEXT.commandEmpty },
    ]);
  });

  it("서버 이름을 바꾸면 그 서버를 가리키던 다른 서버의 템플릿을 오류로 잡는다", () => {
    const renamed = updateService(acme(), 0, 0, { name: "api" });
    const message = `{backend.url}: ${VALIDATION_TEXT.templateNoService}`;
    expect(validateDraft(renamed)).toEqual([
      { group: 0, service: 1, field: "env", message, envIndex: 0 },
      { group: 0, service: 1, field: "env", message, envIndex: 1 },
      { group: 0, service: 2, field: "env", message, envIndex: 0 },
    ]);
  });

  it.each([
    ["{port} 와 같은 그룹 주소는 허용", "run --port {port} --api {backend.url}", null],
    ["템플릿 모양이 아닌 중괄호는 허용", "echo {} {a b}", null],
    ["모르는 토큰", "run ${HOME}", `{HOME}: ${VALIDATION_TEXT.templateUnknown}`],
    ["다른 그룹·없는 서버", "run {ghost.url}", `{ghost.url}: ${VALIDATION_TEXT.templateNoService}`],
  ])("명령 템플릿: %s", (_label: string, command: string, message: string | null) => {
    const issues = validateDraft(editFrontend({ command }));
    expect(issues).toEqual(message ? [{ group: 0, service: 1, field: "command", message }] : []);
  });

  it("env 이름 오류는 어느 줄인지 함께 알려 준다", () => {
    const env = [
      { key: "OK", value: "1" },
      { key: "", value: "2" },
      { key: "1BAD", value: "3" },
      { key: "OK", value: "4" },
    ];
    expect(validateDraft(editFrontend({ env })).map((issue) => [issue.envIndex, issue.message])).toEqual([
      [1, VALIDATION_TEXT.envKeyEmpty],
      [2, VALIDATION_TEXT.envKeyInvalid],
      [3, VALIDATION_TEXT.envKeyDuplicate],
    ]);
  });
});

describe("오류 위치 이동", () => {
  const issue = (group: number, service: number | null): ValidationIssueFace => ({
    group,
    service,
    field: "name",
    message: "x",
  });
  const issues = [issue(0, 1), issue(0, 1), issue(1, null), issue(2, 0)];

  it("위치는 처음 나온 순서대로 한 번씩", () => {
    expect(issueLocations(issues)).toEqual([
      { group: 0, service: 1 },
      { group: 1, service: null },
      { group: 2, service: 0 },
    ]);
  });

  it.each([
    ["오류 없는 곳에서는 첫 위치", { group: 5, service: 0 }, { group: 0, service: 1 }],
    ["현재 위치의 다음", { group: 0, service: 1 }, { group: 1, service: null }],
    ["끝이면 처음으로", { group: 2, service: 0 }, { group: 0, service: 1 }],
  ])("%s", (_label: string, current: { group: number; service: number | null }, expected: unknown) => {
    expect(nextIssueLocation(issues, current)).toEqual(expected);
  });

  it("오류가 없으면 null", () => {
    expect(nextIssueLocation([], null)).toBeNull();
  });
});
