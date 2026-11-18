import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { SnapshotFace } from "@/types/service";

// Rust 명령은 실패 시 사용자용 문자열로 reject 한다.

export const fetchServices = async (): Promise<SnapshotFace> => invoke<SnapshotFace>("get_services");

export const startService = async (id: string): Promise<void> => invoke<void>("start_service", { id });

export const stopService = async (id: string): Promise<void> => invoke<void>("stop_service", { id });

export const openConfig = async (): Promise<void> => invoke<void>("open_config");

export const openLog = async (id: string): Promise<void> => invoke<void>("open_log", { id });

export const openServiceUrl = async (url: string): Promise<void> => openUrl(url);
