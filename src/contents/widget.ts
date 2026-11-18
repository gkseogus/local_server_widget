import type { ServiceOriginType, ServiceStatusType } from "@/types/service";

// 폴링마다 lsof·ps 를 띄우므로 상시 CPU 를 아끼려 3초. 켜기·끄기 직후에는 즉시 다시 조회한다.
export const POLL_INTERVAL_MS = 3000;

export const STATUS_LABELS: Record<ServiceStatusType, string> = {
  on: "실행 중",
  off: "꺼짐",
  conflict: "포트 충돌",
  starting: "시작 중",
  failed: "시작 실패",
};

export const STATUS_DOT_CLASSES: Record<ServiceStatusType, string> = {
  on: "bg-emerald-400",
  off: "bg-zinc-500",
  conflict: "bg-amber-400",
  starting: "bg-sky-400 animate-pulse",
  failed: "bg-rose-500",
};

export const ORIGIN_LABELS: Record<ServiceOriginType, string> = {
  widget: "위젯에서 실행",
  external: "외부에서 실행",
};

/** ON/OFF 스위치가 "켜짐"으로 보는 상태. */
export const RUNNING_STATUSES: readonly ServiceStatusType[] = ["on", "starting"];

export const MESSAGES = {
  title: "로컬서버",
  loadError: "서버 상태를 불러오지 못했습니다.",
  empty: "등록된 서버가 없습니다.",
  emptyHint: "설정에서 프로젝트 폴더를 고르면 바로 등록됩니다.",
  startError: "켜지 못했습니다. 로그를 확인하세요.",
  stopError: "끄지 못했습니다.",
  conflictHint: "다른 프로그램이 이 포트를 쓰고 있습니다.",
  /** 헤더 아이콘: 설정 창 열기 */
  openConfig: "설정 열기",
  /** 설정 오류 화면: services.json 원문 열기 (깨진 파일은 설정 창이 읽지 못한다) */
  openConfigFile: "설정 파일 열기",
  /** 빈 화면: 설정 창 열기 */
  addServer: "서버 추가하기",
  openLog: "로그 열기",
  retry: "다시 시도",
  refresh: "새로고침",
  close: "닫기",
} as const;
