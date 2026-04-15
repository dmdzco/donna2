import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { api } from "@/src/lib/api";
import type { Reminder } from "@/src/types";

/**
 * Fetches all reminders accessible by the current user.
 * The backend filters by the caregiver's assigned seniors.
 * We keep seniorId in the query key so cache invalidation still
 * scopes correctly when used alongside a specific senior context.
 */
export function useReminders(seniorId: string | undefined) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["reminders", seniorId],
    queryFn: async () => {
      const token = await getToken();
      const all = await api.reminders.list(token!);
      // Client-side filter to the specific senior (backend returns all accessible)
      return seniorId ? all.filter((r) => r.seniorId === seniorId) : all;
    },
    enabled: !!seniorId,
  });
}

export function useCreateReminder(seniorId: string | undefined) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Omit<Reminder, "id" | "seniorId" | "createdAt" | "lastDeliveredAt">) => {
      if (!seniorId) throw new Error("No senior selected");
      const token = await getToken();
      return api.reminders.create({ seniorId, ...data }, token!);
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
