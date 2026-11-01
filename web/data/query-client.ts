import { QueryClient } from "@tanstack/react-query";

/**
 * Refresh is event-driven: the SSE bridge invalidates by query key prefix, so a
 * query turns stale on a message. `staleTime` 30 s lets a remount read the cache,
 * and `retry` 1 gives one second attempt per failure.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Only a push carries new information, so focus and reconnect stay quiet.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});
