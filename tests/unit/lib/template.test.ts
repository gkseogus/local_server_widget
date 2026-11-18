import { describe, expect, it } from "vitest";
import { inferKind, localUrl, nextFreePort, resolveTemplate } from "@/lib/template";
import { toDraft } from "@/lib/settingsDraft";
import type { ProjectKindType } from "@/types/config";
import { makeAcmeConfig } from "@tests/helpers/fixtures";

const PORTS = { backend: 8002, frontend: 3100, admin: 5173, draft: null };

describe("resolveTemplate", () => {
  it.each([
    ["{port} 은 자기 포트", "uvicorn --port {port}", "uvicorn --port 3100"],
    ["{이름.url} 은 같은 그룹 주소", "{backend.url}", "http://localhost:8002"],
    ["쉼표로 이은 여러 주소", "{frontend.url},{admin.url}", "http://localhost:3100,http://localhost:5173"],
    ["뒤에 경로가 붙어도", "{backend.url}/api", "http://localhost:8002/api"],
    ["없는 서비스는 그대로", "{ghost.url}", "{ghost.url}"],
    ["포트가 빈 서비스 주소는 그대로", "{draft.url}", "{draft.url}"],
    ["모르는 토큰은 그대로", "${HOME}/x", "${HOME}/x"],
    ["템플릿 모양이 아닌 중괄호는 그대로", "a {} {a b}", "a {} {a b}"],
    ["상속된 속성 이름(constructor)은 서비스가 아니다", "{constructor.url}", "{constructor.url}"],
    ["상속된 속성 이름(toString)은 서비스가 아니다", "{toString.url}", "{toString.url}"],
    ["상속된 속성 이름(__proto__)은 서비스가 아니다", "{__proto__.url}", "{__proto__.url}"],
  ])("%s", (_label: string, text: string, expected: string) => {
    expect(resolveTemplate(text, 3100, PORTS)).toBe(expected);
  });

  it("자기 포트가 비어 있으면 {port} 를 남긴다", () => {
    expect(resolveTemplate("--port {port}", null, PORTS)).toBe("--port {port}");
  });

  it("localUrl 은 Rust 와 같은 http://localhost:<port>", () => {
    expect(localUrl(8002)).toBe("http://localhost:8002");
  });
});

describe("nextFreePort", () => {
  const draft = toDraft(makeAcmeConfig()); // 8002, 3100, 5173

  it.each([
    ["안 쓰는 번호면 그대로", 8000, 8000],
    ["쓰는 번호면 다음 빈 번호", 8002, 8003],
    ["다른 프로젝트 포트도 피한다", 5173, 5174],
  ])("%s", (_label: string, preferred: number, expected: number) => {
    expect(nextFreePort(draft, preferred)).toBe(expected);
  });

  it("끝까지 다 쓰면 null", () => {
    const full = { groups: [{ name: "g", services: [{ ...draft.groups[0].services[0], port: 65535 }] }] };
    expect(nextFreePort(full, 65535)).toBeNull();
  });
});

describe("inferKind", () => {
  it.each<[string, ProjectKindType]>([
    [".venv/bin/uvicorn app.main:app --reload --port {port}", "fastapi"],
    ["./node_modules/.bin/next dev -H 127.0.0.1 -p {port}", "next"],
    ["./node_modules/.bin/vite --port {port} --strictPort", "vite"],
    ["pnpm dev", "unknown"],
    ["", "unknown"],
  ])("%s → %s", (command: string, kind: ProjectKindType) => {
    expect(inferKind(command)).toBe(kind);
  });
});
