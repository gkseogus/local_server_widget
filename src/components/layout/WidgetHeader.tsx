import type { ReactElement } from "react";
import { MESSAGES } from "@/contents/widget";
import { ICON_BUTTON_CLASS, ICON_SVG_PROPS, RUNNING_COUNT_SUFFIX } from "@/contents/widgetHeader";
import { useCloseWidget } from "@/hooks/useCloseWidget";
import { cn } from "@/lib/cn";

interface WidgetHeaderFace {
  runningCount: number;
  totalCount: number;
  isFetching: boolean;
  onRefresh: () => void;
  /** 설정 창을 연다 */
  onOpenSettings: () => void;
}

// Tauri 2 는 속성이 붙은 요소 자체에서만 드래그를 시작하므로 header 와 텍스트에 각각 붙이고, 버튼에는 붙이지 않는다.
const WidgetHeader = ({
  runningCount,
  totalCount,
  isFetching,
  onRefresh,
  onOpenSettings,
}: WidgetHeaderFace): ReactElement => {
  const closeWidget = useCloseWidget();

  return (
    <header
      data-tauri-drag-region
      className="flex shrink-0 items-center h-9 gap-2 px-3 border-b border-zinc-800 select-none"
    >
      <h1 data-tauri-drag-region className="text-sm font-semibold text-zinc-100">
        {MESSAGES.title}
      </h1>
      <span data-tauri-drag-region className="mr-auto text-xs text-zinc-400">
        {`${runningCount}/${totalCount} ${RUNNING_COUNT_SUFFIX}`}
      </span>
      <button
        type="button"
        aria-label={MESSAGES.refresh}
        aria-busy={isFetching}
        onClick={onRefresh}
        className={ICON_BUTTON_CLASS}
      >
        <svg {...ICON_SVG_PROPS} className={cn(isFetching && "animate-spin")}>
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      </button>
      <button type="button" aria-label={MESSAGES.openConfig} onClick={onOpenSettings} className={ICON_BUTTON_CLASS}>
        <svg {...ICON_SVG_PROPS}>
          <path d="M20 7h-9" />
          <path d="M14 17H5" />
          <circle cx="17" cy="17" r="3" />
          <circle cx="7" cy="7" r="3" />
        </svg>
      </button>
      <button type="button" aria-label={MESSAGES.close} onClick={() => closeWidget.mutate()} className={ICON_BUTTON_CLASS}>
        <svg {...ICON_SVG_PROPS}>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </header>
  );
};

export default WidgetHeader;
