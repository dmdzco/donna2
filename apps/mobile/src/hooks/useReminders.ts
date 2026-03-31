import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { api } from "@/src/lib/api";
import type { Reminder } from "@/src/types";

export function useReminders(seniorId: string | undefined) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["reminders", seniorId],
    queryFn: async () => {
      const token = await getToken();
      return api.reminders.list(seniorId!, token!) as Promise<Reminder[]>;
    },
    enabled: !!seniorId,
  });
}

export function useCreateReminder(seniorId: string | undefined) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Omit<Reminder, "id" | "seniorId" | "createdAt" | "lastDeliveredAt">) => {
      const token = await getToken();
      return api.reminders.create(seniorId!, data, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders", seniorId] });
    },
  });
}

export function useUpdateReminder(seniorId: string | undefined) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Reminder> }) => {
      const token = await getToken();
      return api.reminders.update(id, data, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders", seniorId] });
    },
  });
}

export function useDeleteReminder(seniorId: string | undefined) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.reminders.delete(id, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders", seniorId] });
    },
  });
}
