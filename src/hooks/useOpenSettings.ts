import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { openSettings } from "@/api/config";

export const useOpenSettings = (): UseMutationResult<void, string, void> =>
  useMutation<void, string, void>({ mutationFn: openSettings });
