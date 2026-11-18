/** 스켈레톤의 화면낭독기용 라벨 */
export const LOADING_LABEL = "불러오는 중";

/** "설정 파일 열기"가 실패했는데 Rust 오류 문자열이 비어 있을 때 보여줄 문구 */
export const OPEN_CONFIG_ERROR = "설정 파일을 열지 못했습니다.";

/** 설정 창 열기가 실패했는데 Rust 오류 문자열이 비어 있을 때 보여줄 문구 */
export const OPEN_SETTINGS_ERROR = "설정 창을 열지 못했습니다.";

/** 스켈레톤 카드별 서비스 행 수 — 실제 그룹 카드 2개 모양을 흉내 낸다 */
export const SKELETON_ROW_COUNTS: readonly number[] = [3, 2];

/** 오류·빈 화면의 주 버튼 (설정 파일 열기·서버 추가하기) */
export const PRIMARY_BUTTON_CLASSES =
  "px-3 py-1.5 rounded-md bg-zinc-100 text-xs font-medium text-zinc-900 hover:bg-white";

/** 오류·빈 화면의 보조 버튼 (다시 시도) */
export const SECONDARY_BUTTON_CLASSES =
  "px-3 py-1.5 rounded-md border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100";
