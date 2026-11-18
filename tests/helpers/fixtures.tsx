import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ConfigFace, ConfigSnapshotFace, ProjectInfoFace, ServiceConfigFace } from "@/types/config";
import type { GroupFace, ServiceFace, SnapshotFace } from "@/types/service";

export const makeService = (overrides: Partial<ServiceFace> = {}): ServiceFace => {
  const group = overrides.group ?? "acme";
  const name = overrides.name ?? "backend";
  const port = overrides.port ?? 8002;
  return {
    id: `${group}/${name}`,
    group,
    name,
    port,
    url: `http://localhost:${port}`,
    cwd: `/Users/dev/${group}_${name}`,
    command: `.venv/bin/uvicorn app.main:app --reload --port ${port}`,
    env: {},
    status: "off",
    origin: null,
    pids: [],
    listenerCommand: null,
    startedAt: null,
    logPath: `/Users/dev/Library/Logs/widget/${group}-${name}.log`,
    ...overrides,
  };
};

export const makeGroup = (name: string, services: ServiceFace[]): GroupFace => ({ name, services });

export const makeSnapshot = (groups: GroupFace[] = []): SnapshotFace => ({
  groups,
  configPath: "/Users/dev/Library/Application Support/widget/services.json",
});

export interface IpcCallFace {
  cmd: string;
  args: Record<string, unknown>;
}

/**
 * Tauri IPC 목킹. `handlers[cmd]` 가 값을 돌려주거나 문자열을 throw 해 reject 를 흉내 낸다.
 * 처리기가 없는 명령은 undefined 로 끝나고, 모든 호출은 돌려준 배열에 기록된다.
 * 참고: plugin-opener 의 openUrl 은 cmd "plugin:opener|open_url" 로 들어온다.
 */
export const mockCommands = (
  handlers: Record<string, (args: Record<string, unknown>) => unknown>,
): IpcCallFace[] => {
  const calls: IpcCallFace[] = [];
  mockIPC((cmd, args) => {
    const record = (args ?? {}) as Record<string, unknown>;
    calls.push({ cmd, args: record });
    return handlers[cmd]?.(record);
  });
  return calls;
};

export const renderWithClient = (ui: ReactElement): RenderResult => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

export const makeServiceConfig = (overrides: Partial<ServiceConfigFace> = {}): ServiceConfigFace => ({
  name: "backend",
  cwd: "~/Desktop/acme_backend",
  port: 8002,
  command: ".venv/bin/uvicorn app.main:app --reload --port {port}",
  env: {},
  ...overrides,
});

/** README 의 acme 예시 (backend ↔ frontend·admin 연결 포함) */
export const makeAcmeConfig = (): ConfigFace => ({
  groups: [
    {
      name: "acme",
      services: [
        makeServiceConfig({ env: { CORS_ORIGINS: "{frontend.url},{admin.url}" } }),
        makeServiceConfig({
          name: "frontend",
          cwd: "~/Desktop/acme_frontend",
          port: 3100,
          command: "./node_modules/.bin/next dev -H 127.0.0.1 -p {port}",
          env: { BACKEND_ORIGIN: "{backend.url}", NEXT_PUBLIC_API_BASE_URL: "{backend.url}" },
        }),
        makeServiceConfig({
          name: "admin",
          cwd: "~/Desktop/acme_admin",
          port: 5173,
          command: "./node_modules/.bin/vite --port {port} --strictPort",
          env: { VITE_API_URL: "{backend.url}" },
        }),
      ],
    },
  ],
});

/** get_config 응답 (설정 + 읽은 파일의 revision) */
export const makeConfigSnapshot = (config: ConfigFace = makeAcmeConfig(), revision = "rev-1"): ConfigSnapshotFace => ({
  config,
  revision,
});

export const makeProjectInfo = (overrides: Partial<ProjectInfoFace> = {}): ProjectInfoFace => ({
  kind: "fastapi",
  suggestedGroup: "acme",
  suggestedName: "backend",
  command: ".venv/bin/uvicorn app.main:app --reload --port {port}",
  defaultPort: 8000,
  apiEnvKeys: [],
  corsEnvKeys: [],
  ...overrides,
});
