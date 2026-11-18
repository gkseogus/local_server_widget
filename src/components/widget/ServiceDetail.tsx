import { Fragment, type ReactElement, type ReactNode } from "react";
import { DETAIL_LABELS, EMPTY_VALUE, NO_ENV_LABEL, OPEN_LOG_ERROR } from "@/contents/serviceDetail";
import { MESSAGES, ORIGIN_LABELS } from "@/contents/widget";
import { useOpenLog } from "@/hooks/useOpenLog";
import { cn } from "@/lib/cn";
import type { ServiceFace } from "@/types/service";

interface ServiceDetailFace {
  service: ServiceFace;
}

interface DetailRowFace {
  label: string;
  value: ReactNode;
  warn?: boolean;
}

const ServiceDetail = ({ service }: ServiceDetailFace): ReactElement => {
  const openLog = useOpenLog();
  const isConflict = service.status === "conflict";
  const envEntries = Object.entries(service.env);

  const rows: DetailRowFace[] = [
    { label: DETAIL_LABELS.origin, value: service.origin ? ORIGIN_LABELS[service.origin] : EMPTY_VALUE },
    { label: DETAIL_LABELS.pids, value: service.pids.length > 0 ? service.pids.join(", ") : EMPTY_VALUE },
    { label: DETAIL_LABELS.startedAt, value: service.startedAt ?? EMPTY_VALUE },
    { label: DETAIL_LABELS.cwd, value: service.cwd },
    { label: DETAIL_LABELS.command, value: service.command },
  ];
  // ps 명령은 절대 경로라 설정 command 와 비교할 수 없으므로 충돌일 때만 노출
  if (isConflict && service.listenerCommand) {
    rows.push({ label: DETAIL_LABELS.listener, value: service.listenerCommand, warn: true });
  }
  rows.push({
    label: DETAIL_LABELS.env,
    value:
      envEntries.length > 0
        ? envEntries.map(([key, value]) => (
            <span key={key} className="block">
              {key}={value}
            </span>
          ))
        : NO_ENV_LABEL,
  });

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt className={cn("text-[11px] text-zinc-500", row.warn && "text-amber-400")}>{row.label}</dt>
            <dd className={cn("font-mono text-[11px] text-zinc-300 break-all select-text", row.warn && "text-amber-300")}>
              {row.value}
            </dd>
          </Fragment>
        ))}
      </dl>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => openLog.mutate(service.id)}
          disabled={openLog.isPending}
          className="px-1.5 py-0.5 rounded-md text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
        >
          {MESSAGES.openLog}
        </button>
        {openLog.isError && (
          <p role="alert" className="text-[11px] text-rose-400">
            {OPEN_LOG_ERROR}
          </p>
        )}
      </div>
    </div>
  );
};

export default ServiceDetail;
