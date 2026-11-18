import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { closeWidget } from "@/api/window";

export const useCloseWidget = (): UseMutationResult<void, string, void> =>
  useMutation<void, string, void>({ mutationFn: closeWidget });
