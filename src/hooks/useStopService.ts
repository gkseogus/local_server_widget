import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/api/keys";
import { stopService } from "@/api/service";

/** Variables = service id ("<group>/<name>"). */
export const useStopService = (): UseMutationResult<void, string, string> => {
  const queryClient = useQueryClient();
  return useMutation<void, string, string>({
    mutationFn: stopService,
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.services }),
  });
};
