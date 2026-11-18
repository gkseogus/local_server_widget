import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/api/keys";
import { saveConfig } from "@/api/config";
import type { ConfigSnapshotFace } from "@/types/config";

/**
 * Variables = 저장할 설정 전체 + 편집을 시작한 파일의 revision. Data = 저장한 파일의 새 revision.
 * 실패하면 Rust 가 문제를 한 줄에 하나씩 돌려준다 (파일이 밖에서 바뀌었으면 그 안내 한 줄).
 */
export const useSaveConfig = (): UseMutationResult<string, string, ConfigSnapshotFace> => {
  const queryClient = useQueryClient();
  return useMutation<string, string, ConfigSnapshotFace>({
    mutationFn: saveConfig,
    onSuccess: (revision: string, { config }: ConfigSnapshotFace) => {
      // 다시 읽어 오기 전에도 저장한 내용이 기준이 되도록 바로 넣어 둔다 (편집 화면 깜빡임 방지)
      queryClient.setQueryData<ConfigSnapshotFace>(QUERY_KEYS.config, { config, revision });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.config });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.services });
    },
  });
};
