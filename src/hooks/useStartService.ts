import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/api/keys";
import { startService } from "@/api/service";

/** Variables = service id ("<group>/<name>"). */
export const useStartService = (): UseMutationResult<void, string, string> => {
  const queryClient = useQueryClient();
  return useMutation<void, string, string>({
    mutationFn: startService,
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.services }),
  });
};
