import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { openServiceUrl } from "@/api/service";

/** Variables = url. */
export const useOpenUrl = (): UseMutationResult<void, string, string> =>
  useMutation<void, string, string>({ mutationFn: openServiceUrl });
