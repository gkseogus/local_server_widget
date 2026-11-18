import type { ReactElement } from "react";
import { BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from "@/contents/form";
import { LOAD_TEXT } from "@/contents/settings";

interface SettingsLoadErrorFace {
  /** Rust 가 돌려준 원문 — 설정 파일의 어느 줄이 틀렸는지 담고 있다 */
  message: string;
  /** "JSON 직접 편집" 이 실패했을 때 보여 줄 문구 */
  openError: string | null;
  onRetry: () => void;
  onOpenJson: () => void;
}

// 깨진 파일은 설정 창이 고칠 수 없으므로 JSON 을 직접 열어 고치게 안내한다
const SettingsLoadError = ({ message, openError, onRetry, onOpenJson }: SettingsLoadErrorFace): ReactElement => (
  <div className="flex items-center justify-center h-screen px-10 bg-zinc-950">
    <div role="alert" className="w-full max-w-md space-y-3">
      <h1 className="text-[15px] font-semibold text-zinc-100">{LOAD_TEXT.title}</h1>
      <p className="text-xs leading-5 text-zinc-400">{LOAD_TEXT.hint}</p>
      {message && (
        <p className="max-h-40 overflow-y-auto p-3 bg-zinc-900 border border-zinc-800 rounded-lg font-mono text-[11px] leading-5 text-zinc-300 whitespace-pre-wrap break-words select-text">
          {message}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onOpenJson} className={PRIMARY_BUTTON_CLASS}>
          {LOAD_TEXT.openJson}
        </button>
        <button type="button" onClick={onRetry} className={BUTTON_CLASS}>
          {LOAD_TEXT.retry}
        </button>
      </div>
      {openError !== null && <p className="text-[11px] text-rose-400">{openError || LOAD_TEXT.openJsonError}</p>}
    </div>
  </div>
);

export default SettingsLoadError;
