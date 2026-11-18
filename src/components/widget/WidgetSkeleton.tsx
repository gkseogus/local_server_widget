import type { ReactElement } from "react";
import { LOADING_LABEL, SKELETON_ROW_COUNTS } from "@/contents/app";

// 그룹 카드(헤더 + 서비스 행)와 같은 패딩·높이의 자리표시자
const WidgetSkeleton = (): ReactElement => (
  <div role="status" aria-busy="true" className="flex-1 overflow-hidden space-y-2 p-2">
    <span className="sr-only">{LOADING_LABEL}</span>
    {SKELETON_ROW_COUNTS.map((rowCount, cardIndex) => (
      <div
        key={cardIndex}
        aria-hidden="true"
        className="rounded-lg bg-zinc-900 border border-zinc-800 animate-pulse"
      >
        <div className="flex items-center justify-between px-3 py-2">
          <div className="h-3 w-20 rounded bg-zinc-800" />
          <div className="h-5 w-9 rounded-full bg-zinc-800" />
        </div>
        <div className="divide-y divide-zinc-800 border-t border-zinc-800">
          {Array.from({ length: rowCount }, (_, rowIndex) => (
            <div key={rowIndex} className="px-3 py-2">
              <div className="flex items-center h-6 gap-2">
                <div className="size-2 rounded-full bg-zinc-800" />
                <div className="h-3 w-16 rounded bg-zinc-800" />
                <div className="h-3 w-8 rounded bg-zinc-800" />
                <div className="h-5 w-9 ml-auto rounded-full bg-zinc-800" />
              </div>
              <div className="flex items-center h-4 pl-4">
                <div className="h-2.5 w-28 rounded bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

export default WidgetSkeleton;
