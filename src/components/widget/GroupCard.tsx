import type { ReactElement } from "react";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import ServiceRow from "@/components/widget/ServiceRow";
import { GROUP_TOGGLE_SUFFIX } from "@/contents/groupCard";
import { MESSAGES } from "@/contents/widget";
import { useToggleGroup } from "@/hooks/useToggleGroup";
import { isSwitchLocked, isSwitchOn } from "@/lib/serviceSwitch";
import type { GroupFace } from "@/types/service";

interface GroupCardFace {
  group: GroupFace;
}

const GroupCard = ({ group }: GroupCardFace): ReactElement => {
  const toggleGroup = useToggleGroup();
  const runningCount = group.services.filter(isSwitchOn).length;
  // 남의 프로세스가 포트를 잡은 서비스는 켜고 끌 수 없으므로 그룹 스위치 판단에서 뺀다.
  const toggleable = group.services.filter((service) => !isSwitchLocked(service));
  const allOn = toggleable.length > 0 && toggleable.every(isSwitchOn);

  return (
    <section className="rounded-lg bg-zinc-900 border border-zinc-800">
      <header className="flex items-center gap-2 px-3 py-2">
        <h2 className="text-sm font-semibold text-zinc-100">{group.name}</h2>
        <span className="mr-auto text-xs text-zinc-400">{`${runningCount}/${group.services.length}`}</span>
        <ToggleSwitch
          checked={allOn}
          onChange={(turnOn: boolean) => toggleGroup.mutate({ group, turnOn })}
          label={`${group.name} ${GROUP_TOGGLE_SUFFIX}`}
          disabled={toggleGroup.isPending || toggleable.length === 0}
        />
      </header>
      {toggleGroup.isError && (
        <p role="alert" className="px-3 pb-2 text-[11px] text-rose-400">
          {/* Rust 오류 문자열을 그대로 보여 주고, 비어 있으면 기본 문구 */}
          {toggleGroup.error || (toggleGroup.variables?.turnOn ? MESSAGES.startError : MESSAGES.stopError)}
        </p>
      )}
      <ul className="divide-y divide-zinc-800 border-t border-zinc-800">
        {group.services.map((service) => (
          <ServiceRow key={service.id} service={service} />
        ))}
      </ul>
    </section>
  );
};

export default GroupCard;
