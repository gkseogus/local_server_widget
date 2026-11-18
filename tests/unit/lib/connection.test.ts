import { describe, expect, it } from "vitest";
import {
  corsValue,
  readApiConnection,
  readCorsConnection,
  removeEnvVars,
  renameEnvVar,
  setEnvVar,
  visibleConnections,
  writeApiConnection,
  writeCorsConnection,
} from "@/lib/connection";
import type { EnvRowFace } from "@/types/settings";

const rows = (env: Record<string, string>): EnvRowFace[] => Object.entries(env).map(([key, value]) => ({ key, value }));

describe("readApiConnection", () => {
  it("값이 정확히 {형제.url} 인 키를 모두 모은다", () => {
    const env = rows({ NEXT_PUBLIC_API_BASE_URL: "{backend.url}", BACKEND_ORIGIN: "{backend.url}", OTHER: "x" });
    expect(readApiConnection(env, ["backend", "admin"])).toEqual({
      backend: "backend",
      keys: ["NEXT_PUBLIC_API_BASE_URL", "BACKEND_ORIGIN"],
    });
  });

  it.each([
    ["CORS 이름의 키", { CORS_ORIGINS: "{frontend.url}" }],
    ["형제가 아닌 이름", { VITE_API_URL: "{ghost.url}" }],
    ["뒤에 경로가 붙은 값", { VITE_API_URL: "{backend.url}/api" }],
    ["env 가 비어 있음", {}],
  ])("%s 는 연결로 읽지 않는다", (_label: string, env: Record<string, string>) => {
    expect(readApiConnection(rows(env), ["backend", "frontend"])).toEqual({ backend: null, keys: [] });
  });

  it("여러 백엔드를 가리키면 처음 것을 고른다", () => {
    const env = rows({ A_API_URL: "{api.url}", B_API_URL: "{backend.url}" });
    expect(readApiConnection(env, ["api", "backend"])).toEqual({ backend: "api", keys: ["A_API_URL"] });
  });
});

describe("readCorsConnection", () => {
  it("쉼표로 이은 형제 주소 목록을 읽는다", () => {
    expect(readCorsConnection(rows({ CORS_ORIGINS: "{frontend.url},{admin.url}" }), ["frontend", "admin"])).toEqual({
      key: "CORS_ORIGINS",
      frontends: ["frontend", "admin"],
    });
  });

  it("CORS 이름 키면 주소 하나도 읽는다", () => {
    expect(readCorsConnection(rows({ BACKEND_ALLOWED_ORIGINS: "{frontend.url}" }), ["frontend"])).toEqual({
      key: "BACKEND_ALLOWED_ORIGINS",
      frontends: ["frontend"],
    });
  });

  it.each([
    ["CORS 이름이 아닌 키의 주소 하나", { VITE_API_URL: "{frontend.url}" }],
    ["형제가 아닌 이름이 섞임", { CORS_ORIGINS: "{frontend.url},{ghost.url}" }],
    ["주소가 아닌 값", { CORS_ORIGINS: "http://localhost:3000" }],
  ])("%s 는 읽지 않는다", (_label: string, env: Record<string, string>) => {
    expect(readCorsConnection(rows(env), ["frontend"])).toEqual({ key: null, frontends: [] });
  });
});

describe("env 행 편집", () => {
  const env = rows({ A: "1", B: "2" });

  it("setEnvVar 는 있으면 제자리에서 값만, 없으면 끝에 붙인다", () => {
    expect(setEnvVar(env, "A", "9")).toEqual(rows({ A: "9", B: "2" }));
    expect(setEnvVar(env, "C", "3")).toEqual(rows({ A: "1", B: "2", C: "3" }));
    expect(env).toEqual(rows({ A: "1", B: "2" }));
  });

  it("removeEnvVars·renameEnvVar", () => {
    expect(removeEnvVars(env, ["A"])).toEqual(rows({ B: "2" }));
    expect(renameEnvVar(env, "B", "C")).toEqual(rows({ A: "1", C: "2" }));
  });

  it("corsValue 는 {이름.url} 을 쉼표로 잇는다", () => {
    expect(corsValue(["frontend", "admin"])).toBe("{frontend.url},{admin.url}");
  });
});

describe("writeApiConnection", () => {
  const none = { backend: null, keys: [] };

  it("고른 백엔드를 각 변수에 {이름.url} 로 쓴다", () => {
    expect(writeApiConnection(rows({ X: "1" }), none, "backend", ["VITE_API_URL", "API_BASE"])).toEqual(
      rows({ X: "1", VITE_API_URL: "{backend.url}", API_BASE: "{backend.url}" }),
    );
  });

  it("백엔드를 바꾸면 같은 자리의 값만 바뀐다", () => {
    const env = rows({ VITE_API_URL: "{backend.url}", X: "1" });
    expect(writeApiConnection(env, { backend: "backend", keys: ["VITE_API_URL"] }, "api", ["VITE_API_URL"])).toEqual(
      rows({ VITE_API_URL: "{api.url}", X: "1" }),
    );
  });

  it("연결 안 함이면 이전에 연결한 변수만 지운다", () => {
    const env = rows({ VITE_API_URL: "{backend.url}", X: "1" });
    expect(writeApiConnection(env, { backend: "backend", keys: ["VITE_API_URL"] }, null, ["VITE_API_URL"])).toEqual(
      rows({ X: "1" }),
    );
  });
});

describe("writeCorsConnection", () => {
  it("체크한 프론트를 쉼표로 이어 쓰고, 다 빼면 변수를 지운다", () => {
    expect(writeCorsConnection([], "CORS_ORIGINS", ["frontend", "admin"])).toEqual(
      rows({ CORS_ORIGINS: "{frontend.url},{admin.url}" }),
    );
    expect(writeCorsConnection(rows({ CORS_ORIGINS: "{frontend.url}", X: "1" }), "CORS_ORIGINS", [])).toEqual(
      rows({ X: "1" }),
    );
  });
});

describe("visibleConnections", () => {
  const noApi = { backend: null, keys: [] };
  const noCors = { key: null, frontends: [] };

  it.each([
    ["fastapi", { api: false, cors: true }],
    ["next", { api: true, cors: false }],
    ["vite", { api: true, cors: false }],
    ["unknown", { api: true, cors: true }],
    [null, { api: true, cors: true }],
  ] as const)("종류 %s → %o", (kind, expected) => {
    expect(visibleConnections(kind, noApi, noCors)).toEqual(expected);
  });

  it("env 에 이미 관계가 있으면 종류와 상관없이 보인다", () => {
    expect(visibleConnections("fastapi", { backend: "auth", keys: ["AUTH_URL"] }, noCors).api).toBe(true);
    expect(visibleConnections("next", noApi, { key: "CORS_ORIGINS", frontends: ["admin"] }).cors).toBe(true);
  });
});
