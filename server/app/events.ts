import type { EventChannel, ServerEvent } from "@shared/types/events";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

/** Interval of the sse ping, short enough that a proxy keeps an idle stream
    open. */
const HEARTBEAT_MS = 15_000;

type Subscriber = (event: ServerEvent) => void;

const subscribers = new Set<Subscriber>();

/** Pushes one event to every open sse connection; an empty subscriber set
    returns early. Each event carries its channel and a server timestamp. */
export function publish(type: EventChannel, data: unknown = null): void {
  if (subscribers.size === 0) return;
  const event: ServerEvent = { type, data, ts: new Date().toISOString() };
  for (const send of subscribers) send(event);
}

/** Number of open sse connections. */
export function listenerCount(): number {
  return subscribers.size;
}

// One sse stream per browser: the send callback joins the subscriber set, the
// closed promise resolves on abort, and finally takes the callback out again.
export const eventsRoute = new Hono().get("/", (c) =>
  streamSSE(c, async (stream) => {
    const send: Subscriber = (event) => {
      void stream.writeSSE({ data: JSON.stringify(event) });
    };

    subscribers.add(send);
    const closed = new Promise<void>((resolve) => stream.onAbort(resolve));

    // First bytes right away, so a proxy counts the response as started.
    void stream.writeSSE({ event: "ping", data: String(Date.now()) });

    try {
      const heartbeat = setInterval(() => {
        void stream.writeSSE({ event: "ping", data: String(Date.now()) });
      }, HEARTBEAT_MS);
      await closed;
      clearInterval(heartbeat);
    } finally {
      subscribers.delete(send);
    }
  }),
);
