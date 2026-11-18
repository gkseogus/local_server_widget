import { useEffect, useState, type ReactElement } from "react";
import GroupEditor from "@/components/settings/GroupEditor";
import SaveBar from "@/components/settings/SaveBar";
import ServiceEditor from "@/components/settings/ServiceEditor";
import SettingsEmptyState from "@/components/settings/SettingsEmptyState";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { ACTION_ERROR_TEXT, TOAST_DURATION_MS } from "@/contents/settings";
import { useDetectProject } from "@/hooks/useDetectProject";
import { useOpenConfig } from "@/hooks/useOpenConfig";
import { usePickFolder } from "@/hooks/usePickFolder";
import { useSaveConfig } from "@/hooks/useSaveConfig";
import {
  addServiceFromFolder,
  countChanges,
  fallbackProjectInfo,
  fromDraft,
  removeGroup,
  removeService,
  resolveSelection,
} from "@/lib/settingsDraft";
import { nextIssueLocation, validateDraft } from "@/lib/settingsValidation";
import type { ProjectInfoFace } from "@/types/config";
import type { DraftFace, DraftUpdaterType, SelectionFace } from "@/types/settings";

interface SettingsWorkspaceFace {
  /** 파일에 저장된 설정 (변경 건수의 기준) */
  base: DraftFace;
  /** base 를 읽은 파일의 revision */
  revision: string;
  /** 편집을 버리고 파일에서 다시 불러온다 */
  onReload: () => void;
}

// 저장하지 않은 편집(draft)은 이 창 안에서 항목을 옮겨 다녀도 유지된다. null 이면 편집 없음.
const SettingsWorkspace = ({ base, revision, onReload }: SettingsWorkspaceFace): ReactElement => {
  const save = useSaveConfig();
  const pickFolder = usePickFolder();
  const detect = useDetectProject();
  const openConfig = useOpenConfig();
  const [draft, setDraft] = useState<DraftFace | null>(null);
  // draft 를 시작한 파일의 revision. 편집 중에 base 가 다시 읽혀도 이것을 보내야 밖에서 고친 내용을 덮지 않는다.
  const [draftRevision, setDraftRevision] = useState(revision);
  const [selection, setSelection] = useState<SelectionFace | null>(null);
  const { isSuccess: saveSucceeded, reset: resetSave } = save;

  const current = draft ?? base;
  const currentRevision = draft === null ? revision : draftRevision;
  const issues = validateDraft(current);
  const changeCount = countChanges(base, current);
  const active = resolveSelection(current, selection);
  const isBusy = pickFolder.isPending || detect.isPending;
  const actionError =
    (pickFolder.isError && (pickFolder.error || ACTION_ERROR_TEXT.pickFolder)) ||
    (openConfig.isError && (openConfig.error || ACTION_ERROR_TEXT.openJson)) ||
    null;

  // 편집이 없던 상태에서 시작하면 지금 base 의 revision 을 붙잡는다 (이미 편집 중이면 그대로)
  const handleChange = (update: DraftUpdaterType): void => {
    setDraftRevision(currentRevision);
    setDraft((prev) => update(prev ?? base));
  };

  const handleSave = (): void => {
    if (changeCount === 0 || issues.length > 0 || save.isPending) return;
    const saved = current;
    save.mutate(
      { config: fromDraft(saved), revision: currentRevision },
      {
        // 저장하는 동안 더 고친 내용이 있으면 남기고, 그 기준은 방금 저장한 파일이다
        onSuccess: (newRevision: string) => {
          setDraftRevision(newRevision);
          setDraft((prev) => (prev === saved ? null : prev));
        },
      },
    );
  };

  const handleRevert = (): void => {
    setDraft(null);
    resetSave();
  };

  // ponytail: 폴더 선택 창이 떠 있는 동안 이 창을 고칠 수 없다고 보고 클릭 시점의 draft 에 더한다
  const handleAddFromFolder = async (groupIndex: number | null): Promise<void> => {
    let cwd: string | null;
    try {
      cwd = await pickFolder.mutateAsync();
    } catch {
      return; // 문구는 actionError 로 보여 준다
    }
    if (!cwd) return;
    let info: ProjectInfoFace;
    try {
      info = await detect.mutateAsync(cwd);
    } catch {
      info = fallbackProjectInfo(cwd);
    }
    const next = addServiceFromFolder(current, cwd, info, groupIndex);
    handleChange(() => next.draft);
    setSelection(next.selection);
  };

  const handleJumpToIssue = (): void => {
    const next = nextIssueLocation(issues, active);
    if (next) setSelection(next);
  };

  const renderEditor = (): ReactElement => {
    if (!active) {
      return <SettingsEmptyState isBusy={isBusy} onPick={() => void handleAddFromFolder(null)} />;
    }
    const { group, service } = active;
    return (
      <div className="max-w-[640px] px-7 py-6">
        {service === null ? (
          <GroupEditor
            key={`group-${group}`}
            draft={current}
            groupIndex={group}
            issues={issues}
            isBusy={isBusy}
            onChange={handleChange}
            onSelect={setSelection}
            onAddService={() => void handleAddFromFolder(group)}
            onRemove={() => {
              handleChange((d) => removeGroup(d, group));
              setSelection(null);
            }}
          />
        ) : (
          <ServiceEditor
            key={`service-${group}-${service}`}
            draft={current}
            groupIndex={group}
            serviceIndex={service}
            issues={issues}
            onChange={handleChange}
            onRemove={() => {
              handleChange((d) => removeService(d, group, service));
              setSelection({ group, service: null });
            }}
          />
        )}
      </div>
    );
  };

  // 저장 성공 토스트는 잠깐만 띄운다
  useEffect(() => {
    if (!saveSucceeded) return;
    const timer = window.setTimeout(resetSave, TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [saveSucceeded, resetSave]);

  // ⌘S 로 저장 (매 렌더 최신 handleSave 를 건다)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      handleSave();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      <div className="flex flex-1 min-h-0">
        <SettingsSidebar
          draft={current}
          active={active}
          issues={issues}
          isBusy={isBusy}
          onSelect={setSelection}
          onAddProject={() => void handleAddFromFolder(null)}
          onAddService={(groupIndex: number) => void handleAddFromFolder(groupIndex)}
          onOpenJson={() => openConfig.mutate()}
        />
        <main className="flex flex-col flex-1 min-w-0 overflow-y-auto">
          {actionError && (
            <p
              role="alert"
              className="mx-7 mt-4 px-3 py-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-200"
            >
              {actionError}
            </p>
          )}
          <div className="flex flex-col flex-1">{renderEditor()}</div>
        </main>
      </div>
      <SaveBar
        changeCount={changeCount}
        issueCount={issues.length}
        isSaving={save.isPending}
        saveError={save.isError ? save.error : null}
        showToast={saveSucceeded}
        onSave={handleSave}
        onRevert={handleRevert}
        onReload={onReload}
        onJumpToIssue={handleJumpToIssue}
      />
    </div>
  );
};

export default SettingsWorkspace;
