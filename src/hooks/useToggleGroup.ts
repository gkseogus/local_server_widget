import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/api/keys";
import { startService, stopService } from "@/api/service";
import { isSwitchLocked, isSwitchOn } from "@/lib/serviceSwitch";
import type { ServiceFace, ToggleGroupVariablesFace } from "@/types/service";

const needsToggle = (service: ServiceFace, turnOn: boolean): boolean =>
  !isSwitchLocked(service) && isSwitchOn(service) !== turnOn;

/** 그룹의 서비스를 모두 켜거나 끈다. 모든 호출이 끝난 뒤 첫 실패로 reject 한다. */
export const useToggleGroup = (): UseMutationResult<void, string, ToggleGroupVariablesFace> => {
  const queryClient = useQueryClient();
  return useMutation<void, string, ToggleGroupVariablesFace>({
    mutationFn: async ({ group, turnOn }) => {
      const results = await Promise.allSettled(
        group.services
          .filter((service) => needsToggle(service, turnOn))
          .map((service) => (turnOn ? startService(service.id) : stopService(service.id))),
      );
      const failed = results.find((result) => result.status === "rejected");
      if (failed) throw failed.reason;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.services }),
  });
};
