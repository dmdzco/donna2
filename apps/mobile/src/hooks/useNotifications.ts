import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { api } from "@/src/lib/api";
import type { NotificationPreferences } from "@/src/types";

export function useNotificationPreferences() {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["notificationPreferences"],
    queryFn: async () => {
      const token = await getToken();
      return api.notifications.getPreferences(token!) as Promise<NotificationPreferences>;
    },
  });
}

export function useUpdateNotificationPreferences() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (prefs: Partial<NotificationPreferences>) => {
      const token = await getToken();
      return api.notifications.updatePreferences(prefs, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationPreferences"] });
    },
  });
}

export function useNotifications(page: number = 1) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["notifications", page],
    queryFn: async () => {
      const token = await getToken();
      return api.notifications.list(page, token!);
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useMarkNotificationRead() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.notifications.markRead(id, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
