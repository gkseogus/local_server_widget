import type { ReactElement } from "react";
import { PRIMARY_BUTTON_CLASSES } from "@/contents/app";
import { MESSAGES } from "@/contents/widget";
import { cn } from "@/lib/cn";

interface EmptyStateFace {
  /** 설정 창을 연다 */
  onAddServer: () => void;
}

const EmptyState = ({ onAddServer }: EmptyStateFace): ReactElement => (
  <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
    <p className="text-sm text-zinc-100">{MESSAGES.empty}</p>
    <p className="text-xs text-zinc-400">{MESSAGES.emptyHint}</p>
    <button type="button" onClick={onAddServer} className={cn("mt-3", PRIMARY_BUTTON_CLASSES)}>
      {MESSAGES.addServer}
    </button>
  </div>
);

export default EmptyState;
