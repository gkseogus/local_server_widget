import type { ReactElement } from "react";
import { STATUS_DOT_CLASSES } from "@/contents/widget";
import { cn } from "@/lib/cn";
import type { ServiceStatusType } from "@/types/service";

interface StatusDotFace {
  status: ServiceStatusType;
}

// 바로 옆에 상태 문구가 있으므로 보조기기에는 숨긴다
const StatusDot = ({ status }: StatusDotFace): ReactElement => (
  <span aria-hidden="true" className={cn("inline-block shrink-0 size-2 rounded-full",STATUS_DOT_CLASSES[status])} />
);

export default StatusDot;
