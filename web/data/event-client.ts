import type { EventChannel, ServerEvent } from "@shared/types/events";
import { useQueryClient } from "@tanstack/react-query";
import { KEYS } from "@web/lib/queries";
import { useEffect } from "react";

/**
 * Channel → query key prefixes. One message marks every query with that prefix
 * stale, and the queries in view refetch immediately.
 */
const INVALIDATE: Partial<Record<EventChannel, readonly (readonly string[])[]>> = {
  "settings.changed": [KEYS.settings.all, KEYS.wishlist.all],
  "downloads.changed": [KEYS.downloads.all, KEYS.wishlist.all],
  "library.changed": [KEYS.library.all, KEYS.wishlist.all],
  "library.scan": [KEYS.library.all, KEYS.settings.scan, KEYS.wishlist.all],
  "catalog.changed": [KEYS.catalog.all, KEYS.wishlist.all],
  // A sync run has its own query and a copy inside the settings query.
  "catalog.sync": [KEYS.catalog.sync, KEYS.settings.sync],
  "wishlist.changed": [KEYS.wishlist.all],
  "db.changed": [KEYS.db.all],
};

// The endpoint the stream reads from.
const URL = "/api/events";

// The one open stream and the number of subscribers it holds.
let socket: EventSource | null = null;
let listeners = 0;

/**
 * One stream for the whole page. The subscriber count decides: the first opens
 * the socket, the last closes it, so a double mount shares one connection.
 */
function subscribe(onEvent: (event: ServerEvent) => void): () => void {
  listeners += 1;
  if (!socket) {
    socket = new EventSource(URL);
    socket.onmessage = (message) => {
      let event: ServerEvent;
      // A message that fails to parse is dropped.
      try {
        event = JSON.parse(message.data as string) as ServerEvent;
      } catch {
        return;
      }
      for (const listener of subscribers) listener(event);
    };
  }
  subscribers.add(onEvent);

  return () => {
    subscribers.delete(onEvent);
    listeners -= 1;
    if (listeners === 0 && socket) {
      socket.close();
      socket = null;
    }
  };
}

// Every callback the stream feeds: subscribe adds one, the returned function
// takes it away again.
const subscribers = new Set<(event: ServerEvent) => void>();

/** Keeps the stream open while the page is mounted and marks the queries of a
    channel stale as its events arrive. */
export function useEventBridge(): void {
  const client = useQueryClient();

  useEffect(
    () =>
      subscribe((event) => {
        for (const queryKey of INVALIDATE[event.type] ?? []) {
          client.invalidateQueries({ queryKey });
        }
      }),
    [client],
  );
}
