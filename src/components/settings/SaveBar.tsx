import type { ReactElement } from "react";
import ConfirmButton from "@/components/ui/ConfirmButton";
import { GHOST_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from "@/contents/form";
import { SAVE_TEXT } from "@/contents/settings";
import { ICON_SVG_PROPS } from "@/contents/widgetHeader";
import { cn } from "@/lib/cn";

interface SaveBarFace {
  changeCount: number;
  issueCount: number;
  isSaving: boolean;
  /** Rust 가 돌려준 문제 목록 (한 줄에 하나). 실패가 없으면 null */
  saveError: string | null;
  showToast: boolean;
  onSave: () => void;
  onRevert: () => void;
  /** 편집을 버리고 파일에서 다시 불러오기 (저장 실패 시 항상 제공) */
  onReload: () => void;
  onJumpToIssue: () => void;
}

const SaveBar = ({
  changeCount,
  issueCount,
  isSaving,
  saveError,
  showToast,
  onSave,
  onRevert,
  onReload,
  onJumpToIssue,
}: SaveBarFace): ReactElement => {
  const dirty = changeCount > 0;
  const errorLines = saveError?.split("\n").filter((line) => line.trim() !== "") ?? [];

  return (
    <div className="relative shrink-0">
      {/* 토스트가 뜨기 전부터 있어야 화면낭독기가 읽는다 */}
      <div role="status" className="absolute right-4 bottom-full mb-3 pointer-events-none">
        {showToast && (
          <p className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-medium text-zinc-100 shadow-lg shadow-black/40">
            <svg {...ICON_SVG_PROPS} className="text-emerald-400">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {SAVE_TEXT.toast}
          </p>
        )}
      </div>

      {saveError !== null && (
        <div role="alert" className="max-h-36 overflow-y-auto px-4 py-3 bg-rose-500/10 border-t border-rose-500/30">
          <p className="text-xs font-semibold text-rose-200">{SAVE_TEXT.errorTitle}</p>
          <ul className="mt-1.5 pl-4 space-y-0.5 list-disc font-mono text-[11px] leading-5 text-rose-200/90 select-text">
            {(errorLines.length > 0 ? errorLines : [SAVE_TEXT.errorFallback]).map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
          {/* 오류 문구로 갈래를 나누지 않는다 — 파일이 밖에서 바뀐 경우든 아니든 늘 보여 준다 */}
          <div className="mt-2">
            <ConfirmButton
              label={SAVE_TEXT.reload}
              prompt={SAVE_TEXT.reloadPrompt}
              confirmLabel={SAVE_TEXT.reloadConfirm}
              onConfirm={onReload}
            />
          </div>
        </div>
      )}

      <footer className="flex items-center h-12 gap-3 px-4 bg-zinc-900/80 border-t border-zinc-800">
        {dirty ? (
          <span className="flex items-center gap-2 text-xs text-zinc-200">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-400" />
            {`${SAVE_TEXT.dirtyPrefix} ${changeCount}${SAVE_TEXT.dirtySuffix}`}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <svg {...ICON_SVG_PROPS} width={12} height={12}>
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {SAVE_TEXT.saved}
          </span>
        )}
        {issueCount > 0 && (
          <button type="button" onClick={onJumpToIssue} className={cn(GHOST_BUTTON_CLASS, "text-rose-300 hover:text-rose-200")}>
            <span aria-hidden="true" className="size-1.5 rounded-full bg-rose-400" />
            {`${SAVE_TEXT.issuesPrefix} ${issueCount}${SAVE_TEXT.issuesSuffix}`}
          </button>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {dirty && (
            <button type="button" onClick={onRevert} disabled={isSaving} className={cn(GHOST_BUTTON_CLASS, "h-8 px-3")}>
              {SAVE_TEXT.revert}
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || issueCount > 0 || isSaving}
            aria-keyshortcuts="Meta+S"
            className={PRIMARY_BUTTON_CLASS}
          >
            {isSaving ? SAVE_TEXT.saving : SAVE_TEXT.save}
            <kbd aria-hidden="true" className="font-sans text-[10px] font-normal opacity-60">
              {SAVE_TEXT.shortcut}
            </kbd>
          </button>
        </div>
      </footer>
    </div>
  );
};

export default SaveBar;
