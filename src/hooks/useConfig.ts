import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/api/keys";
import { fetchConfig } from "@/api/config";
import type { ConfigSnapshotFace } from "@/types/config";

/** services.json 원문 구조와 그 revision. 폴링하지 않는다 (편집 중인 화면이 바뀌지 않도록). */
export const useConfig = (): UseQueryResult<ConfigSnapshotFace, string> =>
  useQuery<ConfigSnapshotFace, string>({
    queryKey: QUERY_KEYS.config,
    queryFn: fetchConfig,
    retry: false,
  });
