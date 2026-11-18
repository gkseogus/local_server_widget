import { useMemo, useState, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/api/keys";
import SettingsLoadError from "@/components/settings/SettingsLoadError";
import SettingsSkeleton from "@/components/settings/SettingsSkeleton";
import SettingsWorkspace from "@/components/settings/SettingsWorkspace";
import { useConfig } from "@/hooks/useConfig";
import { useOpenConfig } from "@/hooks/useOpenConfig";
import { toDraft } from "@/lib/settingsDraft";

/** 설정 창(label "settings") 의 루트. 위젯 창은 App 을 그린다. */
const SettingsApp = (): ReactElement => {
  const queryClient = useQueryClient();
  const config = useConfig();
  const openConfig = useOpenConfig();
  const base = useMemo(() => (config.data ? toDraft(config.data.config) : null), [config.data]);
  // 바뀌면 편집 화면을 새로 그려 draft·revision·선택·저장 오류를 함께 버린다
  const [reloadCount, setReloadCount] = useState(0);

  // 편집을 버리고 캐시를 비운 뒤 새로 읽는다. 파일이 깨져 읽지 못하면 아래 불러오기 오류 화면(JSON 직접 편집·다시 시도)으로 간다.
  const handleReload = (): void => {
    setReloadCount((count) => count + 1);
    void queryClient.resetQueries({ queryKey: QUERY_KEYS.config });
  };

  // 다시 불러오다 실패해도 이미 받은 설정이 있으면 편집 화면(과 저장 안 한 변경)을 유지한다
  if (base && config.data) {
    return <SettingsWorkspace key={reloadCount} base={base} revision={config.data.revision} onReload={handleReload} />;
  }
  if (config.isPending) return <SettingsSkeleton />;
  return (
    <SettingsLoadError
      message={config.error ?? ""}
      openError={openConfig.isError ? openConfig.error : null}
      onRetry={() => void config.refetch()}
      onOpenJson={() => openConfig.mutate()}
    />
  );
};

export default SettingsApp;
