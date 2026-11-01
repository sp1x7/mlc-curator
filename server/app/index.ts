import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { startSync } from "../board/sync";
import { resumeAtStartup } from "../downloads/runner";
import { startScan } from "../library/stand";
import { PASS_KEYS, UPGRADES_ENABLED } from "../settings/keys";
import { numberSetting, on } from "../settings/store";
import { startUpgradeCheck } from "../upgrades/run";
import { api } from "./app";

const app = new Hono();
app.route("/api", api);

// The client bundle lives in dist/, written by `vite build`; the second handler
// answers index.html for every path that stays empty on disk, so a direct entry
// still loads the desktop.
app.use("/*", serveStatic({ root: "./dist" }));
app.get("/*", serveStatic({ root: "./dist", path: "index.html" }));

/** Port of the http server, taken from PORT, dev default 5174. */
const port = Number(process.env.PORT ?? 5174);

// Bun closes a connection after this many idle seconds; the sse stream stays
// quiet between events, so the timeout has to cover the heartbeat interval.
const IDLE_TIMEOUT_S = 120;

const server = Bun.serve({
  port,
  idleTimeout: IDLE_TIMEOUT_S,
  fetch: (req) => app.fetch(req),
});

console.log(`mlc-curator server: http://localhost:${server.port}`);

type Pass = {
  // atBoot runs the pass once at boot while it holds "1"; everyMin above 0
  // repeats it on an interval. Both values are plain settings rows, so an empty
  // row leaves the pass idle.
  atBoot: string;
  everyMin: string;
  run: () => void;
};

const passes: Pass[] = [
  { atBoot: PASS_KEYS.library.atBoot, everyMin: PASS_KEYS.library.everyMin, run: startScan },
  { atBoot: PASS_KEYS.catalog.atBoot, everyMin: PASS_KEYS.catalog.everyMin, run: startSync },
  {
    atBoot: PASS_KEYS.upgrades.atBoot,
    everyMin: PASS_KEYS.upgrades.everyMin,
    // The automatic check runs while the area switch of upgrades is on.
    run: () => {
      if (on(UPGRADES_ENABLED)) startUpgradeCheck();
    },
  },
  {
    atBoot: PASS_KEYS.downloads.atBoot,
    everyMin: PASS_KEYS.downloads.everyMin,
    run: resumeAtStartup,
  },
];

// Boot passes first, then one interval per pass that carries a minute count.
for (const pass of passes) {
  if (on(pass.atBoot)) pass.run();

  const minutes = numberSetting(pass.everyMin);
  if (minutes > 0) {
    setInterval(() => pass.run(), minutes * 60_000);
  }
}
