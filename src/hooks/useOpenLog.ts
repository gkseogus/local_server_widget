import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { openLog } from "@/api/service";

/** Variables = service id. */
export const useOpenLog = (): UseMutationResult<void, string, string> =>
  useMutation<void, string, string>({ mutationFn: openLog });
