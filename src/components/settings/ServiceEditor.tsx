import { useEffect, useId, useState, type ReactElement } from "react";
import ConnectionSection from "@/components/settings/ConnectionSection";
import EnvEditor from "@/components/settings/EnvEditor";
import KindBadge from "@/components/settings/KindBadge";
import ServicePreview from "@/components/settings/ServicePreview";
import ConfirmButton from "@/components/ui/ConfirmButton";
import TextField from "@/components/ui/TextField";
import { BUTTON_CLASS, ERROR_TEXT_CLASS, PANEL_CLASS, SECTION_TITLE_CLASS } from "@/contents/form";
import { ACTION_ERROR_TEXT, ENV_TEXT, SERVICE_TEXT, SIDEBAR_TEXT } from "@/contents/settings";
import { RUNNING_STATUSES } from "@/contents/widget";
import { ICON_SVG_PROPS } from "@/contents/widgetHeader";
import { useDetectProject } from "@/hooks/useDetectProject";
import { usePickFolder } from "@/hooks/usePickFolder";
import { useServices } from "@/hooks/useServices";
import { urlRef } from "@/lib/connection";
import { applyDetection, updateService } from "@/lib/settingsDraft";
import { inferKind } from "@/lib/template";
import type {
  DraftFace,
  DraftServiceFace,
  DraftUpdaterType,
  TemplateOptionFace,
  ValidationFieldType,
  ValidationIssueFace,
} from "@/types/settings";

interface ServiceEditorFace {
  draft: DraftFace;
  groupIndex: number;
  serviceIndex: number;
  issues: ValidationIssueFace[];
  onChange: (update: DraftUpdaterType) => void;
  onRemove: () => void;
}

const ServiceEditor = ({ draft, groupIndex, serviceIndex, issues, onChange, onRemove }: ServiceEditorFace): ReactElement => {
  const id = useId();
  const group = draft.groups[groupIndex];
  const service = group.services[serviceIndex];
  const pickFolder = usePickFolder();
  const detect = useDetectProject();
  const services = useServices();
  // 편집기를 연 순간의 폴더만 자동으로 살펴본다 (변수 이름 제안·감지 명령용)
  const [initialCwd] = useState(service.cwd);
  const { mutate: runDetect } = detect;

  const own = issues.filter((issue) => issue.group === groupIndex && issue.service === serviceIndex);
  const errorOf = (field: ValidationFieldType): string | undefined =>
    own.find((issue) => issue.field === field)?.message;
  const detected = detect.data ?? null;
  const siblings = group.services.filter((other, i) => i !== serviceIndex && other.name.trim() !== "");
  const groupPorts = Object.fromEntries(group.services.map((s) => [s.name, s.port]));
  const templateOptions: TemplateOptionFace[] = [
    { value: "{port}", label: `{port} · ${ENV_TEXT.portOption}` },
    ...siblings.map((s) => ({ value: urlRef(s.name), label: `${urlRef(s.name)} · ${s.name} ${ENV_TEXT.urlOptionSuffix}` })),
  ];
  // 저장된 이름으로 실행 중인지 본다. 이름을 바꾸는 중이면 안내가 사라지지만 저장 전이라 괜찮다.
  const isRunning = (services.data?.groups ?? []).some((g) =>
    g.services.some((s) => s.id === `${group.name}/${service.name}` && RUNNING_STATUSES.includes(s.status)),
  );

  const update = (patch: Partial<DraftServiceFace>): void =>
    onChange((d) => updateService(d, groupIndex, serviceIndex, patch));

  const handlePickFolder = async (): Promise<void> => {
    let cwd: string | null;
    try {
      cwd = await pickFolder.mutateAsync();
    } catch {
      return; // 문구는 pickFolder.isError 로 보여 준다
    }
    if (!cwd) return;
    const picked = cwd;
    update({ cwd: picked });
    runDetect(picked, {
      onSuccess: (info) => onChange((d) => applyDetection(d, groupIndex, serviceIndex, info)),
    });
  };

  const folderMessage = detect.isPending ? SERVICE_TEXT.detecting : SERVICE_TEXT.folderHelper;
  const folderError = errorOf("cwd") ?? (detect.isError ? SERVICE_TEXT.detectError : null);
  const detectedCommand = detected?.command && detected.command !== service.command ? detected.command : null;

  useEffect(() => {
    if (initialCwd) runDetect(initialCwd);
  }, [initialCwd, runDetect]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-medium text-zinc-500 truncate">{`${group.name} ${SERVICE_TEXT.subtitleSuffix}`}</p>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-zinc-50 truncate">{service.name || SIDEBAR_TEXT.unnamed}</h1>
          <KindBadge kind={inferKind(service.command)} />
        </div>
      </header>

      {isRunning && (
        <p className="flex items-start gap-2 px-3 py-2.5 bg-amber-500/10 border border-amber-500/25 rounded-lg text-xs leading-5 text-amber-200">
          <svg {...ICON_SVG_PROPS} className="mt-0.5 shrink-0 text-amber-400">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          {SERVICE_TEXT.running}
        </p>
      )}

      <section aria-labelledby={`${id}-basic`}>
        <h2 id={`${id}-basic`} className={SECTION_TITLE_CLASS}>
          {SERVICE_TEXT.basicTitle}
        </h2>
        <div className={PANEL_CLASS}>
          <div>
            <TextField
              label={SERVICE_TEXT.folderLabel}
              value={service.cwd}
              onChange={(cwd: string) => update({ cwd })}
              helper={folderMessage}
              error={folderError}
              mono
              placeholder="~/Desktop/my_project"
              action={
                <button
                  type="button"
                  onClick={() => void handlePickFolder()}
                  disabled={pickFolder.isPending}
                  className={BUTTON_CLASS}
                >
                  <svg {...ICON_SVG_PROPS}>
                    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                  </svg>
                  {SERVICE_TEXT.pickFolder}
                </button>
              }
            />
            {pickFolder.isError && (
              <p role="alert" className={ERROR_TEXT_CLASS}>
                {pickFolder.error || ACTION_ERROR_TEXT.pickFolder}
              </p>
            )}
          </div>
          <TextField
            label={SERVICE_TEXT.nameLabel}
            value={service.name}
            onChange={(name: string) => update({ name })}
            helper={SERVICE_TEXT.nameHelper}
            error={errorOf("name")}
          />
          <TextField
            label={SERVICE_TEXT.portLabel}
            value={service.port === null ? "" : String(service.port)}
            onChange={(value: string) => {
              const digits = value.replace(/\D/g, "");
              update({ port: digits ? Number(digits) : null });
            }}
            helper={SERVICE_TEXT.portHelper}
            error={errorOf("port")}
            mono
            inputMode="numeric"
            maxLength={5}
            inputClassName="w-28"
          />
          <TextField
            label={SERVICE_TEXT.commandLabel}
            value={service.command}
            onChange={(command: string) => update({ command })}
            helper={SERVICE_TEXT.commandHelper}
            error={errorOf("command")}
            mono
            action={
              detectedCommand && (
                <button type="button" onClick={() => update({ command: detectedCommand })} className={BUTTON_CLASS}>
                  {SERVICE_TEXT.applyDetected}
                </button>
              )
            }
          />
        </div>
      </section>

      <ConnectionSection
        env={service.env}
        siblings={siblings}
        detected={detected}
        onChangeEnv={(env) => update({ env })}
      />

      <EnvEditor
        env={service.env}
        issues={own.filter((issue) => issue.field === "env")}
        templateOptions={templateOptions}
        onChange={(env) => update({ env })}
      />

      <ServicePreview service={service} groupPorts={groupPorts} />

      <div className="flex justify-end pt-2 border-t border-zinc-800/70">
        <ConfirmButton label={SERVICE_TEXT.delete} prompt={SERVICE_TEXT.deletePrompt} onConfirm={onRemove} />
      </div>
    </div>
  );
};

export default ServiceEditor;
