export const DETAIL_LABELS = {
  origin: "출처",
  pids: "PID",
  startedAt: "시작 시각",
  cwd: "폴더",
  command: "실행 명령",
  listener: "포트 점유 프로세스",
  env: "주입 환경변수",
} as const;

/** 값이 없을 때 표시 */
export const EMPTY_VALUE = "—";

/** 주입 환경변수가 하나도 없을 때 표시 */
export const NO_ENV_LABEL = "없음";

export const OPEN_LOG_ERROR = "로그를 열지 못했습니다.";
