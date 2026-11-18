import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/api/keys";
import { fetchServices } from "@/api/service";
import { POLL_INTERVAL_MS } from "@/contents/widget";
import type { SnapshotFace } from "@/types/service";

export const useServices = (): UseQueryResult<SnapshotFace, string> =>
  useQuery<SnapshotFace, string>({
    queryKey: QUERY_KEYS.services,
    queryFn: fetchServices,
    refetchInterval: POLL_INTERVAL_MS,
    retry: false,
  });
