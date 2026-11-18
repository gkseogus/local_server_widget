import type { ReactElement } from "react";
import { PRIMARY_BUTTON_CLASS } from "@/contents/form";
import { EMPTY_TEXT } from "@/contents/settings";
import { ICON_SVG_PROPS } from "@/contents/widgetHeader";
import { cn } from "@/lib/cn";

interface SettingsEmptyStateFace {
  isBusy: boolean;
  onPick: () => void;
}

const SettingsEmptyState = ({ isBusy, onPick }: SettingsEmptyStateFace): ReactElement => (
  <div className="flex flex-1 flex-col items-center justify-center gap-2 px-10 py-12 text-center">
    <div className="flex items-center justify-center size-12 mb-2 bg-zinc-900 border border-zinc-800 rounded-2xl text-emerald-400">
      <svg {...ICON_SVG_PROPS} width={22} height={22} strokeWidth={1.75}>
        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
        <path d="M12 10v6M9 13h6" />
      </svg>
    </div>
    <h2 className="text-[15px] font-semibold text-zinc-100">{EMPTY_TEXT.title}</h2>
    <p className="max-w-80 text-xs leading-5 text-zinc-400 break-keep text-balance">{EMPTY_TEXT.hint}</p>
    <button type="button" onClick={onPick} disabled={isBusy} className={cn(PRIMARY_BUTTON_CLASS, "h-9 mt-3 px-5 text-[13px]")}>
      {isBusy ? EMPTY_TEXT.picking : EMPTY_TEXT.pick}
    </button>
  </div>
);

export default SettingsEmptyState;
