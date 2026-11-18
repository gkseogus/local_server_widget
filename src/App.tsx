import type { ReactElement } from "react";
import ConfigError from "@/components/widget/ConfigError";
import EmptyState from "@/components/widget/EmptyState";
import WidgetHeader from "@/components/layout/WidgetHeader";
import GroupCard from "@/components/widget/GroupCard";
import WidgetSkeleton from "@/components/widget/WidgetSkeleton";
import { OPEN_CONFIG_ERROR, OPEN_SETTINGS_ERROR } from "@/contents/app";
import { useOpenConfig } from "@/hooks/useOpenConfig";
import { useOpenSettings } from "@/hooks/useOpenSettings";
import { useServices } from "@/hooks/useServices";
import { isSwitchOn } from "@/lib/serviceSwitch";

const App = (): ReactElement => {
  const { data, error, isPending, isFetching, refetch } = useServices();
  const openConfig = useOpenConfig();
  const openSettings = useOpenSettings();

  const groups = data?.groups ?? [];
  const services = groups.flatMap((group) => group.services);
  // GroupCard 와 같은 기준(스위치가 켜진 것)으로 센다
  const runningCount = services.filter(isSwitchOn).length;

  // 클릭 이벤트가 refetch/mutate 인자로 흘러 들어가지 않도록 감싼다.
  // 조회가 진행 중이면 새로 띄우지 않는다(연타해도 Rust 쪽 lsof 작업이 쌓이지 않게).
  const handleRefresh = (): void => {
    void refetch({ cancelRefetch: false });
  };
  // 깨진 설정 파일은 설정 창이 읽지 못하므로 오류 화면에서만 JSON 원문을 연다
  const handleOpenConfig = (): void => openConfig.mutate();
  const handleOpenSettings = (): void => openSettings.mutate();
  // 빈 문자열(||)도 대체 문구로 바꾼다
  const openError =
    (openSettings.isError && (openSettings.error || OPEN_SETTINGS_ERROR)) ||
    (openConfig.isError && (openConfig.error || OPEN_CONFIG_ERROR));

  const renderBody = (): ReactElement => {
    if (isPending) return <WidgetSkeleton />;
    if (error !== null) {
      return <ConfigError message={error} onRetry={handleRefresh} onOpenConfig={handleOpenConfig} />;
    }
    if (services.length === 0) return <EmptyState onAddServer={handleOpenSettings} />;
    return (
      <div className="flex-1 overflow-y-auto space-y-2 p-2">
        {groups.map((group) => (
          <GroupCard key={group.name} group={group} />
        ))}
      </div>
    );
  };

  // 프레임 없는 창의 유일한 드래그 손잡이라 헤더는 어떤 상태에서도 그린다
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-950">
      <WidgetHeader
        runningCount={runningCount}
        totalCount={services.length}
        isFetching={isFetching}
        onRefresh={handleRefresh}
        onOpenSettings={handleOpenSettings}
      />
      <main className="flex flex-col flex-1 min-h-0">
        {openError && (
          <p
            role="alert"
            className="shrink-0 px-3 py-1.5 border-b border-zinc-800 text-[11px] text-rose-400 whitespace-pre-wrap break-words"
          >
            {openError}
          </p>
        )}
        {renderBody()}
      </main>
    </div>
  );
};

export default App;
