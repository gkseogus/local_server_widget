import { invoke } from "@tauri-apps/api/core";
import type { ConfigSnapshotFace, ProjectInfoFace } from "@/types/config";

// 설정 창 IPC. Rust 명령은 실패 시 사용자용 한국어 문자열로 reject 한다 (save_config 는 문제마다 한 줄).

export const fetchConfig = async (): Promise<ConfigSnapshotFace> => invoke<ConfigSnapshotFace>("get_config");

/**
 * revision = 편집을 시작한 파일의 지문. 그 뒤 디스크의 파일이 바뀌었으면 Rust 가 저장하지 않고 reject 한다.
 * 저장한 파일의 새 revision 을 돌려준다.
 */
export const saveConfig = async ({ config, revision }: ConfigSnapshotFace): Promise<string> =>
  invoke<string>("save_config", { config, revision });

/** 취소하면 null. 홈 아래 폴더는 "~/..." 로 온다. */
export const pickFolder = async (): Promise<string | null> => invoke<string | null>("pick_folder");

export const detectProject = async (cwd: string): Promise<ProjectInfoFace> =>
  invoke<ProjectInfoFace>("detect_project", { cwd });

/** 설정 창을 만들거나, 이미 열려 있으면 앞으로 가져온다. */
export const openSettings = async (): Promise<void> => invoke<void>("open_settings");
