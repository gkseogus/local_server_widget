import type { ReactElement } from "react";
import { LOADING_LABEL, SKELETON_ROW_COUNTS } from "@/contents/app";

// 사이드바(220px) + 편집 영역 + 저장 바와 같은 자리를 잡아 불러온 뒤 화면이 튀지 않게 한다
const SettingsSkeleton = (): ReactElement => (
  <div role="status" aria-busy="true" className="flex flex-col h-screen bg-zinc-950">
    <span className="sr-only">{LOADING_LABEL}</span>
    <div aria-hidden="true" className="flex flex-1 min-h-0 animate-pulse">
      <div className="w-[220px] shrink-0 px-3 py-3 space-y-4 bg-zinc-900/60 border-r border-zinc-800">
        <div className="h-2.5 w-14 rounded bg-zinc-800" />
        {SKELETON_ROW_COUNTS.map((rows, group) => (
          <div key={group} className="space-y-2">
            <div className="h-3.5 w-24 rounded bg-zinc-800" />
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="h-3 ml-3 w-32 rounded bg-zinc-800/70" />
            ))}
          </div>
        ))}
      </div>
      <div className="flex-1 px-8 py-6 space-y-5">
        <div className="h-5 w-40 rounded bg-zinc-800" />
        <div className="h-48 rounded-xl bg-zinc-900 border border-zinc-800" />
        <div className="h-32 rounded-xl bg-zinc-900 border border-zinc-800" />
      </div>
    </div>
    <div aria-hidden="true" className="h-12 shrink-0 bg-zinc-900/80 border-t border-zinc-800" />
  </div>
);

export default SettingsSkeleton;
