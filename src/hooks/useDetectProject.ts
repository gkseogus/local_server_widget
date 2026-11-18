import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { detectProject } from "@/api/config";
import type { ProjectInfoFace } from "@/types/config";

/** Variables = 폴더 경로 ("~/..." 허용). 필요할 때만 부른다. */
export const useDetectProject = (): UseMutationResult<ProjectInfoFace, string, string> =>
  useMutation<ProjectInfoFace, string, string>({ mutationFn: detectProject });
