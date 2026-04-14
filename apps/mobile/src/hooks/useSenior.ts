import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { api } from "@/src/lib/api";
import type { Senior } from "@/src/types";

export function useSenior(seniorId: string | undefined) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["senior", seniorId],
    queryFn: async () => {
      const token = await getToken();
      return api.seniors.get(seniorId!, token!);
    },
    enabled: !!seniorId,
  });
}

export function useUpdateSenior(seniorId: string | undefined) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<Senior>) => {
      const token = await getToken();
      return api.seniors.update(seniorId!, data, token!);
    },
    onSuccess: (updatedSenior) => {
      queryClient.setQueryData(["senior", seniorId], updatedSenior);
      queryClient.invalidateQueries({ queryKey: ["senior", seniorId] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useSchedule(seniorId: string | undefined) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["schedule", seniorId],
    queryFn: async () => {
      const token = await getToken();
      return api.seniors.getSchedule(seniorId!, token!);
    },
    enabled: !!seniorId,
  });
}

export function useUpdateSchedule(seniorId: string | undefined) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { schedule?: unknown; topicsToAvoid?: string[] }) => {
      const token = await getToken();
      return api.seniors.updateSchedule(seniorId!, data, token!);
    },
    onSuccess: (updatedSchedule) => {
      queryClient.setQueryData(["schedule", seniorId], updatedSchedule);
      queryClient.invalidateQueries({ queryKey: ["schedule", seniorId] });
    },
  });
}
