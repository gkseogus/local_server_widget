import type { ReactElement } from "react";
import { PRIMARY_BUTTON_CLASSES, SECONDARY_BUTTON_CLASSES } from "@/contents/app";
import { MESSAGES } from "@/contents/widget";

interface ConfigErrorFace {
  /** Rust 가 돌려준 원문 — 설정 파일의 어느 줄이 틀렸는지 담고 있어 그대로 보여준다 */
  message: string;
  onRetry: () => void;
  onOpenConfig: () => void;
}

const ConfigError = ({ message, onRetry, onOpenConfig }: ConfigErrorFace): ReactElement => (
  <div role="alert" className="flex flex-1 flex-col overflow-y-auto gap-3 p-4">
    <p className="text-sm font-medium text-zinc-100">{MESSAGES.loadError}</p>
    <p className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[11px] text-zinc-400 whitespace-pre-wrap break-words">
      {message}
    </p>
    <div className="flex gap-2">
      <button type="button" onClick={onOpenConfig} className={PRIMARY_BUTTON_CLASSES}>
        {MESSAGES.openConfigFile}
      </button>
      <button type="button" onClick={onRetry} className={SECONDARY_BUTTON_CLASSES}>
        {MESSAGES.retry}
      </button>
    </div>
  </div>
);

export default ConfigError;
