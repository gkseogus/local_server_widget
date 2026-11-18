import type { KeyboardEvent, ReactElement } from "react";
import KindBadge from "@/components/settings/KindBadge";
import { GHOST_BUTTON_CLASS, NAV_ITEM_ACTIVE_CLASS, NAV_ITEM_CLASS, SECTION_TITLE_CLASS } from "@/contents/form";
import { SIDEBAR_TEXT } from "@/contents/settings";
import { ICON_SVG_PROPS } from "@/contents/widgetHeader";
import { cn } from "@/lib/cn";
import { inferKind } from "@/lib/template";
import type { DraftFace, SelectionFace, ValidationIssueFace } from "@/types/settings";

interface SettingsSidebarFace {
  draft: DraftFace;
  active: SelectionFace | null;
  issues: ValidationIssueFace[];
  /** 폴더 선택·감지 중이면 추가 버튼을 잠근다 */
  isBusy: boolean;
  onSelect: (selection: SelectionFace) => void;
  onAddProject: () => void;
  onAddService: (groupIndex: number) => void;
  onOpenJson: () => void;
}

const SettingsSidebar = ({
  draft,
  active,
  issues,
  isBusy,
  onSelect,
  onAddProject,
  onAddService,
  onOpenJson,
}: SettingsSidebarFace): ReactElement => {
  const hasIssue = (group: number, service: number | null): boolean =>
    issues.some((issue) => issue.group === group && issue.service === service);

  // 위·아래 화살표로 항목 사이를 옮기며 바로 연다 (macOS 사이드바처럼)
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-nav-item]"));
    const next = items[items.indexOf(document.activeElement as HTMLButtonElement) + (event.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.click();
  };

  const issueMark = (
    <>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-rose-400" />
      <span className="sr-only">{SIDEBAR_TEXT.hasIssue}</span>
    </>
  );

  return (
    <aside className="flex flex-col w-[220px] shrink-0 bg-zinc-900/60 border-r border-zinc-800">
      <nav aria-label={SIDEBAR_TEXT.label} onKeyDown={handleKeyDown} className="flex-1 overflow-y-auto px-2 py-3">
        <p className={SECTION_TITLE_CLASS}>{SIDEBAR_TEXT.title}</p>
        <ul className="space-y-3">
          {draft.groups.map((group, gi) => {
            const groupActive = active?.group === gi && active.service === null;
            return (
              <li key={gi} className="group/project">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    data-nav-item
                    aria-current={groupActive ? "true" : undefined}
                    onClick={() => onSelect({ group: gi, service: null })}
                    className={cn(NAV_ITEM_CLASS, "flex-1 px-2 text-[13px] font-semibold text-zinc-100", groupActive && NAV_ITEM_ACTIVE_CLASS)}
                  >
                    <span className="truncate">{group.name || SIDEBAR_TEXT.unnamed}</span>
                    {hasIssue(gi, null) && issueMark}
                  </button>
                  <button
                    type="button"
                    aria-label={`${group.name} ${SIDEBAR_TEXT.addServerSuffix}`}
                    onClick={() => onAddService(gi)}
                    disabled={isBusy}
                    className={cn(
                      GHOST_BUTTON_CLASS,
                      "h-6 px-1.5 text-[11px] opacity-0 group-hover/project:opacity-100 focus-visible:opacity-100",
                    )}
                  >
                    <svg {...ICON_SVG_PROPS} width={12} height={12}>
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {SIDEBAR_TEXT.addServer}
                  </button>
                </div>
                {group.services.length > 0 && (
                  <ul className="mt-0.5 space-y-px">
                    {group.services.map((service, si) => {
                      const serviceActive = active?.group === gi && active.service === si;
                      return (
                        <li key={si}>
                          <button
                            type="button"
                            data-nav-item
                            aria-current={serviceActive ? "true" : undefined}
                            onClick={() => onSelect({ group: gi, service: si })}
                            className={cn(NAV_ITEM_CLASS, "pl-5 pr-2 text-[13px] text-zinc-300", serviceActive && NAV_ITEM_ACTIVE_CLASS)}
                          >
                            <span className="flex-1 min-w-0 truncate">{service.name || SIDEBAR_TEXT.unnamed}</span>
                            {hasIssue(gi, si) && issueMark}
                            <KindBadge kind={inferKind(service.command)} />
                            <span className="shrink-0 font-mono text-[11px] text-zinc-500">:{service.port ?? "—"}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="shrink-0 p-2 space-y-0.5 border-t border-zinc-800">
        <button type="button" onClick={onAddProject} disabled={isBusy} className={cn(GHOST_BUTTON_CLASS, "w-full text-zinc-300")}>
          <svg {...ICON_SVG_PROPS}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          {SIDEBAR_TEXT.addProject}
        </button>
        <button type="button" onClick={onOpenJson} className={cn(GHOST_BUTTON_CLASS, "w-full h-6 text-[11px] text-zinc-500")}>
          {SIDEBAR_TEXT.openJson}
          <svg {...ICON_SVG_PROPS} width={11} height={11}>
            <path d="M7 17 17 7M8 7h9v9" />
          </svg>
        </button>
      </div>
    </aside>
  );
};

export default SettingsSidebar;
