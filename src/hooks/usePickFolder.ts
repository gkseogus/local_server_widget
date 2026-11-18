import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { pickFolder } from "@/api/config";

/** 결과 = 고른 폴더 경로, 취소하면 null. */
export const usePickFolder = (): UseMutationResult<string | null, string, void> =>
  useMutation<string | null, string, void>({ mutationFn: pickFolder });
