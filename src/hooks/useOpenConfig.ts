import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { openConfig } from "@/api/service";

export const useOpenConfig = (): UseMutationResult<void, string, void> =>
  useMutation<void, string, void>({ mutationFn: openConfig });
