import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { api } from "@/src/lib/api";
import type { NotificationPreferences } from "@/src/types";
import { useStableIdempotencyKey } from "@/src/hooks/useStableIdempotencyKey";


export function useNotificationPreferences() {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: ["notificationPreferences"],
    queryFn: async () => {
      const token = await getToken();
      return api.notifications.getPreferences(token!);
    },
  });
}

export function useUpdateNotificationPreferences() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const idempotency = useStableIdempotencyKey("notification-prefs-update");

  return useMutation({
    mutationFn: async (prefs: Partial<NotificationPreferences>) => {
      const token = await getToken();
      return api.notifications.updatePreferences(prefs, token!, {
        idempotencyKey: idempotency.getKey(prefs),
      });
    },
    onSuccess: () => {
      idempotency.reset();
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
  const idempotency = useStableIdempotencyKey("notification-mark-read");

  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return api.notifications.markRead(id, token!, {
        idempotencyKey: idempotency.getKey({ id }),
      });
    },
    onSuccess: () => {
      idempotency.reset();
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
