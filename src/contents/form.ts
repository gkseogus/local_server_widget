// 설정 창 입력·버튼 공통 스타일 (zinc 다크, emerald 강조)

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50";

export const INPUT_CLASS =
  "h-8 w-full min-w-0 px-2.5 bg-zinc-900 border border-zinc-700 rounded-md text-[13px] text-zinc-100 placeholder:text-zinc-600 select-text transition-colors focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-50";

export const INPUT_ERROR_CLASS = "border-rose-500/70 focus:border-rose-500 focus:ring-rose-500/30";

export const SELECT_CLASS = `${INPUT_CLASS} pr-7 cursor-pointer`;

export const LABEL_CLASS = "block mb-1.5 text-xs font-medium text-zinc-300";

export const HELPER_CLASS = "mt-1.5 text-[11px] leading-4 text-zinc-500";

export const ERROR_TEXT_CLASS = "mt-1.5 text-[11px] leading-4 text-rose-400";

export const SECTION_TITLE_CLASS = "mb-2 px-1 text-[11px] font-semibold tracking-wider text-zinc-500";

export const PANEL_CLASS = "p-4 space-y-4 bg-zinc-900/50 border border-zinc-800 rounded-xl";

export const BUTTON_CLASS = `inline-flex shrink-0 items-center justify-center h-8 gap-1.5 px-3 bg-zinc-800 border border-zinc-700 rounded-md text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:opacity-40 disabled:pointer-events-none ${FOCUS_RING}`;

export const PRIMARY_BUTTON_CLASS = `inline-flex shrink-0 items-center justify-center h-8 gap-1.5 px-3.5 bg-emerald-600 rounded-md text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:pointer-events-none ${FOCUS_RING}`;

export const GHOST_BUTTON_CLASS = `inline-flex shrink-0 items-center h-7 gap-1 px-2 rounded-md text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40 ${FOCUS_RING}`;

export const DANGER_BUTTON_CLASS = `inline-flex shrink-0 items-center justify-center h-8 gap-1.5 px-3 border border-rose-500/30 rounded-md text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/10 ${FOCUS_RING}`;

export const DANGER_SOLID_BUTTON_CLASS = `inline-flex shrink-0 items-center justify-center h-8 px-3 bg-rose-600 rounded-md text-xs font-semibold text-white transition-colors hover:bg-rose-500 ${FOCUS_RING}`;

/** 사이드바 항목 (프로젝트·서버) */
export const NAV_ITEM_CLASS = `flex w-full min-w-0 items-center h-7 gap-1.5 rounded-md text-left transition-colors hover:bg-zinc-800/70 ${FOCUS_RING}`;

export const NAV_ITEM_ACTIVE_CLASS = "bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/20";

export const CHECKBOX_CLASS = "size-3.5 rounded accent-emerald-500 cursor-pointer";

export const MONO_CLASS = "font-mono text-[12px]";

/** 두 단계 삭제 확인 버튼 문구 */
export const CONFIRM_TEXT = {
  confirm: "삭제",
  cancel: "취소",
} as const;
