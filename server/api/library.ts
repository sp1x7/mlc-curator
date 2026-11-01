// Library api: GET /stand answers the stand of the last pass, PUT /root saves a
// root and launches a pass, POST /scan launches one pass. The folder rules live
// in `server/library/root.ts`.

import { Hono } from "hono";
import { jsonBody } from "../app/json";
import { setLibraryRoot } from "../library/root";
import { currentStand, scanRunning, startScan } from "../library/stand";

export const libraryRoute = new Hono();

// The in-memory stand of the last scan: roots, movies, series, counts.
libraryRoute.get("/stand", (c) => c.json(currentStand()));

// Stores one library root through setLibraryRoot; a rejected path answers 400
// with its error text, an accepted path starts a scan and comes back as root.
libraryRoute.put("/root", async (c) => {
  const body = await jsonBody<{ root?: string }>(c.req);

  const answer = setLibraryRoot(body?.root);
  if ("error" in answer) return c.json({ error: answer.error }, 400);

  startScan();

  return c.json({ root: answer.root });
});

// Launches a scan pass and reports the running flag of the scanner.
libraryRoute.post("/scan", (c) => {
  startScan();
  return c.json({ ok: true, running: scanRunning() });
});
