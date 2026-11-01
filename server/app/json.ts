// Reading the body of a write request: one place, so a window that sends an
// empty body or broken json gets the route's own answer in place of a stack
// trace from the server.

/** Reads the json body of a request and hands back null for an empty body or a
    parse failure, which keeps the status code on the route. */
export async function jsonBody<T>(request: { json: () => Promise<unknown> }): Promise<T | null> {
  return (await request.json().catch(() => null)) as T | null;
}
