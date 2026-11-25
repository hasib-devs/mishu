import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteThread,
  getThread,
  listThreads,
  type ThreadDetail,
  type ThreadSummary,
} from "@/lib/thread-api";
import {
  createChithi,
  deleteChithi,
  getChithi,
  listChithis,
  updateChithi,
  type Chithi,
  type PaperStyle,
} from "@/lib/chithi-api";

export type CreateChithiArgs = {
  content: string;
  paperStyle?: PaperStyle;
  generatedFor?: number | null;
};

export type UpdateChithiArgs = {
  id: string;
  content: string;
  paperStyle?: PaperStyle;
};

export function useThreads() {
  return useQuery<ThreadSummary[], Error>({
    queryKey: ["threads"],
    queryFn: listThreads,
  });
}

export function useThread(threadId: string | null) {
  return useQuery<ThreadDetail | null, Error>({
    queryKey: ["thread", threadId],
    enabled: threadId !== null,
    queryFn: async () => {
      if (threadId === null) return null;
      try {
        return await getThread(threadId);
      } catch {
        return null;
      }
    },
  });
}

export function useChithis() {
  return useQuery<Chithi[], Error>({
    queryKey: ["chithis"],
    queryFn: () => listChithis(),
  });
}

export function useChithi(id: string | null) {
  return useQuery<Chithi, Error>({
    queryKey: ["chithi", id],
    enabled: id !== null,
    queryFn: () => getChithi(id!),
  });
}

export function useDeleteThreadMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteThread,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });
}

export function useDeleteChithiMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteChithi,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chithis"] });
    },
  });
}

export function useCreateChithiMutation() {
  const queryClient = useQueryClient();
  return useMutation<Chithi, Error, CreateChithiArgs>({
    mutationFn: ({ content, paperStyle, generatedFor }) =>
      createChithi(content, { paperStyle, generatedFor }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chithis"] });
    },
  });
}

export function useUpdateChithiMutation() {
  const queryClient = useQueryClient();
  return useMutation<Chithi, Error, UpdateChithiArgs>({
    mutationFn: ({ id, content, paperStyle }) => updateChithi(id, { content, paperStyle }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chithis"] });
    },
  });
}
