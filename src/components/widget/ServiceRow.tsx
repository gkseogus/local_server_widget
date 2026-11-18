import { useState, type ReactElement } from "react";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import ServiceDetail from "@/components/widget/ServiceDetail";
import StatusDot from "@/components/widget/StatusDot";
import { OPEN_LOG_ERROR } from "@/contents/serviceDetail";
import { SERVICE_ROW_LABELS } from "@/contents/serviceRow";
import { MESSAGES, STATUS_LABELS } from "@/contents/widget";
import { ICON_BUTTON_CLASS, ICON_SVG_PROPS } from "@/contents/widgetHeader";
import { useOpenLog } from "@/hooks/useOpenLog";
import { useOpenUrl } from "@/hooks/useOpenUrl";
import { useStartService } from "@/hooks/useStartService";
import { useStopService } from "@/hooks/useStopService";
import { cn } from "@/lib/cn";
import { isSwitchLocked, isSwitchOn } from "@/lib/serviceSwitch";
import type { ServiceFace } from "@/types/service";

interface ServiceRowFace {
  service: ServiceFace;
}

const ServiceRow = ({ service }: ServiceRowFace): ReactElement => {
  const [expanded, setExpanded] = useState(false);
  const start = useStartService();
  const stop = useStopService();
  const openUrl = useOpenUrl();
  const openLog = useOpenLog();

  const failed = service.status === "failed";
  // Rust 오류 문자열은 사용자용 한국어 문구라 그대로 보여주고, 비어 있으면 기본 문구로 대체한다
  const errorMessage =
    (start.isError && (start.error || MESSAGES.startError)) ||
    (stop.isError && (stop.error || MESSAGES.stopError)) ||
    (openUrl.isError && SERVICE_ROW_LABELS.openUrlError) ||
    (openLog.isError && OPEN_LOG_ERROR);

  const handleToggle = (next: boolean): void => {
    // 반대 동작의 이전 오류 문구가 남지 않도록 지운다
    if (next) {
      stop.reset();
      start.mutate(service.id);
    } else {
      start.reset();
      stop.mutate(service.id);
    }
  };

  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-2">
        <StatusDot status={service.status} />
        <span className="min-w-0 truncate text-sm text-zinc-100">{service.name}</span>
        <span className="font-mono text-[11px] text-zinc-400">:{service.port}</span>
        <span className={cn("shrink-0 text-[11px] text-zinc-500", failed && "text-rose-400")}>
          {STATUS_LABELS[service.status]}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <ToggleSwitch
            checked={isSwitchOn(service)}
            onChange={handleToggle}
            label={service.id}
            disabled={isSwitchLocked(service) || start.isPending || stop.isPending}
          />
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={SERVICE_ROW_LABELS.detail}
            onClick={() => setExpanded((prev) => !prev)}
            className={ICON_BUTTON_CLASS}
          >
            <svg {...ICON_SVG_PROPS} className={cn("transition-transform", expanded && "rotate-180")}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-4">
        <button
          type="button"
          onClick={() => openUrl.mutate(service.url)}
          disabled={service.status !== "on"}
          className="min-w-0 truncate font-mono text-[11px] text-sky-400 enabled:hover:underline disabled:cursor-default disabled:text-zinc-600"
        >
          {service.url}
        </button>
        {failed && (
          <button
            type="button"
            onClick={() => openLog.mutate(service.id)}
            className="shrink-0 text-[11px] text-rose-400 hover:underline"
          >
            {MESSAGES.openLog}
          </button>
        )}
      </div>
      {service.status === "conflict" && <p className="pl-4 text-[11px] text-amber-400">{MESSAGES.conflictHint}</p>}
      {errorMessage && (
        <p role="alert" className="pl-4 text-[11px] text-rose-400">
          {errorMessage}
        </p>
      )}
      {expanded && (
        <div className="mt-2 pl-4">
          <ServiceDetail service={service} />
        </div>
      )}
    </li>
  );
};

export default ServiceRow;
