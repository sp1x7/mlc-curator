// The one way a window talks to the server.
//
// A client names the area it belongs to and gets four verbs. An answer outside
// the accepted statuses throws with the reason the server named; a caller that
// expects a status to be data names it in `ok` and reads the body itself.

/** Cells that go into a query string; a cell holding undefined stays out. */
export type Cells = Record<string, string | number | undefined>;

type Options = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Cells;
  /** Status numbers that count as an answer; left out, 2xx and 304 do. */
  ok?: number[];
};

/** The query string of the cells that hold a value; an empty set answers "". */
function queryOf(cells?: Cells): string {
  const pairs = Object.entries(cells ?? {}).filter(([, value]) => value !== undefined);
  if (pairs.length === 0) return "";

  return `?${new URLSearchParams(pairs.map(([key, value]) => [key, String(value)]))}`;
}

/** The reason the server names in its body; an absent `error` falls back to the
    status number. */
function reasonOf(data: unknown, status: number): string {
  const body = data as { error?: unknown } | null;

  return typeof body?.error === "string" && body.error !== "" ? body.error : `HTTP ${status}`;
}

/** One request: json out, json in, and a throw built from the answer body. */
async function call<T>(url: string, options?: Options): Promise<T> {
  const response = await fetch(url, {
    method: options?.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const data = (await response.json().catch(() => null)) as T;
  const wanted = options?.ok;
  // `ok` decides alone; otherwise the http status of the answer decides.
  const good =
    wanted !== undefined
      ? wanted.includes(response.status)
      : response.ok || response.status === 304;

  if (!good) throw new Error(reasonOf(data, response.status));

  return data;
}

/** The client of one api area: `/api/<area>` plus the path of an endpoint. */
export function clientOf(area: string) {
  // A path of "/" is the area itself: the trailing slash goes off, so the url
  // keeps one last part.
  const url = (path: string, query?: Cells) =>
    `/api/${area}${path.endsWith("/") ? path.slice(0, -1) : path}${queryOf(query)}`;

  return {
    get: <T>(path: string, query?: Cells) => call<T>(url(path, query)),

    /** A request that reads its answer from `ok`: the listed statuses arrive as
        data. */
    ask: <T>(path: string, options: Options) => call<T>(url(path), options),

    post: <T>(path: string, body?: unknown, ok?: number[]) =>
      call<T>(url(path), { method: "POST", body, ok }),

    put: <T>(path: string, body?: unknown, ok?: number[]) =>
      call<T>(url(path), { method: "PUT", body, ok }),

    del: <T>(path: string, body?: unknown, ok?: number[]) =>
      call<T>(url(path), { method: "DELETE", body, ok }),
  };
}
