import type { ReactElement } from "react";
import { KIND_BADGE_CLASSES, KIND_LABELS } from "@/contents/settings";
import { cn } from "@/lib/cn";
import type { ProjectKindType } from "@/types/config";

interface KindBadgeFace {
  kind: ProjectKindType;
}

// 종류를 모르면 아무것도 그리지 않는다 ("기타" 배지는 정보가 없다)
const KindBadge = ({ kind }: KindBadgeFace): ReactElement | null =>
  kind === "unknown" ? null : (
    <span
      className={cn(
        "inline-flex shrink-0 items-center h-4 px-1.5 rounded text-[10px] font-medium leading-none ring-1 ring-inset",
        KIND_BADGE_CLASSES[kind],
      )}
    >
      {KIND_LABELS[kind]}
    </span>
  );

export default KindBadge;
