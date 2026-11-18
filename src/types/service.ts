// src-tauri/src/model.rs (ServiceView / GroupView / Snapshot) 와 짝. 함께 바꿀 것.

export type ServiceStatusType = "on" | "off" | "conflict" | "starting" | "failed";

export type ServiceOriginType = "widget" | "external";

export interface ServiceFace {
  /** "<group>/<name>" */
  id: string;
  group: string;
  name: string;
  port: number;
  /** http://localhost:<port> */
  url: string;
  cwd: string;
  command: string;
  env: Record<string, string>;
  status: ServiceStatusType;
  origin: ServiceOriginType | null;
  pids: number[];
  /** 포트를 잡고 있는 프로세스의 명령 ("on", "conflict" 일 때). */
  listenerCommand: string | null;
  startedAt: string | null;
  logPath: string;
}

export interface GroupFace {
  name: string;
  services: ServiceFace[];
}

export interface SnapshotFace {
  groups: GroupFace[];
  configPath: string;
}

export interface ToggleGroupVariablesFace {
  group: GroupFace;
  turnOn: boolean;
}
