// src-tauri/src/model.rs (ConfigFile / GroupConfig / ServiceConfig / ProjectInfo) 와 짝. 함께 바꿀 것.

/** services.json 의 서비스 한 개 (템플릿 치환 전 원문). */
export interface ServiceConfigFace {
  name: string;
  /** 절대 경로 또는 "~/..." */
  cwd: string;
  port: number;
  /** `{port}`, `{<서비스>.url}` 템플릿 사용 가능 */
  command: string;
  env: Record<string, string>;
}

export interface GroupConfigFace {
  name: string;
  services: ServiceConfigFace[];
}

export interface ConfigFace {
  groups: GroupConfigFace[];
}

export type ProjectKindType = "fastapi" | "next" | "vite" | "unknown";

/** 폴더를 고르면 Rust 가 감지해 돌려주는 제안값 (detect_project). */
export interface ProjectInfoFace {
  kind: ProjectKindType;
  suggestedGroup: string | null;
  suggestedName: string;
  command: string | null;
  defaultPort: number | null;
  /** .env* 에서 찾은 백엔드 주소 변수 이름 (예: NEXT_PUBLIC_API_BASE_URL, VITE_API_URL) */
  apiEnvKeys: string[];
  /** .env* 에서 찾은 CORS 변수 이름 (예: CORS_ORIGINS) */
  corsEnvKeys: string[];
}

/** get_config 응답. revision 은 읽은 파일의 지문 — save_config 에 그대로 돌려보낸다. */
export interface ConfigSnapshotFace {
  config: ConfigFace;
  revision: string;
}
