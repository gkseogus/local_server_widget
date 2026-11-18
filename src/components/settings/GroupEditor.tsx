import type { ReactElement } from "react";
import KindBadge from "@/components/settings/KindBadge";
import ConfirmButton from "@/components/ui/ConfirmButton";
import TextField from "@/components/ui/TextField";
import { BUTTON_CLASS, PANEL_CLASS, SECTION_TITLE_CLASS } from "@/contents/form";
import { GROUP_TEXT, SIDEBAR_TEXT } from "@/contents/settings";
import { ICON_SVG_PROPS } from "@/contents/widgetHeader";
import { updateGroup } from "@/lib/settingsDraft";
import { inferKind } from "@/lib/template";
import type { DraftFace, DraftUpdaterType, SelectionFace, ValidationIssueFace } from "@/types/settings";

interface GroupEditorFace {
  draft: DraftFace;
  groupIndex: number;
  issues: ValidationIssueFace[];
  isBusy: boolean;
  onChange: (update: DraftUpdaterType) => void;
  onSelect: (selection: SelectionFace) => void;
  onAddService: () => void;
  onRemove: () => void;
}

const GroupEditor = ({
  draft,
  groupIndex,
  issues,
  isBusy,
  onChange,
  onSelect,
  onAddService,
  onRemove,
}: GroupEditorFace): ReactElement => {
  const group = draft.groups[groupIndex];
  const nameError = issues.find((issue) => issue.group === groupIndex && issue.service === null)?.message;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-medium text-zinc-500">{GROUP_TEXT.heading}</p>
        <h1 className="text-lg font-semibold text-zinc-50 truncate">{group.name || SIDEBAR_TEXT.unnamed}</h1>
      </header>

      <section className={PANEL_CLASS}>
        <TextField
          label={GROUP_TEXT.nameLabel}
          value={group.name}
          onChange={(name: string) => onChange((d) => updateGroup(d, groupIndex, { name }))}
          helper={GROUP_TEXT.nameHelper}
          error={nameError}
        />
      </section>

      <section>
        <h2 className={SECTION_TITLE_CLASS}>{GROUP_TEXT.servicesTitle}</h2>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl">
          {group.services.length === 0 ? (
            <p className="px-4 py-5 text-xs text-zinc-500">{GROUP_TEXT.noServices}</p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {group.services.map((service, si) => (
                <li key={si}>
                  <button
                    type="button"
                    onClick={() => onSelect({ group: groupIndex, service: si })}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-zinc-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/50"
                  >
                    <span className="min-w-0 text-[13px] font-medium text-zinc-100 truncate">
                      {service.name || SIDEBAR_TEXT.unnamed}
                    </span>
                    <KindBadge kind={inferKind(service.command)} />
                    <span className="flex-1 min-w-0 font-mono text-[11px] text-zinc-500 truncate">{service.cwd}</span>
                    <span className="shrink-0 font-mono text-[11px] text-zinc-400">:{service.port ?? "—"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="px-4 py-3 border-t border-zinc-800">
            <button type="button" onClick={onAddService} disabled={isBusy} className={BUTTON_CLASS}>
              <svg {...ICON_SVG_PROPS}>
                <path d="M12 5v14M5 12h14" />
              </svg>
              {GROUP_TEXT.addServer}
            </button>
          </div>
        </div>
      </section>

      <div className="flex justify-end pt-2 border-t border-zinc-800/70">
        <ConfirmButton label={GROUP_TEXT.delete} prompt={GROUP_TEXT.deletePrompt} onConfirm={onRemove} />
      </div>
    </div>
  );
};

export default GroupEditor;
