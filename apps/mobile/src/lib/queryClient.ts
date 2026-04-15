import { QueryClient } from "@tanstack/react-query";
import { isRetryableApiError } from "@/src/lib/api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 30,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) =>
        failureCount < 2 && isRetryableApiError(error),
      staleTime: 1000 * 30,
    },
    mutations: {
      retry: false,
    },
  },
});
