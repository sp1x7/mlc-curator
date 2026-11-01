// Board http: page fetches that obey the board's pace.
//
// The board answers with a javascript cookie challenge, so the value is stored
// and the url reloaded, up to the attempt count of the settings row. Every
// access waits out the delay after the previous one inside one strictly serial
// queue. The sfdl chain ends in a confirmation form, which puts the post path on
// the same queue as the get path.

import { numberSetting } from "../settings/store";
import {
  BOARD,
  CHALLENGE_RE,
  cookieHeader,
  cookiesFromResponse,
  setBoardCookie,
  UA,
} from "./cookies";

// Every board tunable is a row in the settings table; numberSetting reads an
// empty row as 0, which turns delay, attempts and byte ceiling off.

let lastRequest = 0;
let queue: Promise<unknown> = Promise.resolve();

export type Page = {
  ok: boolean;
  status: number;
  url: string;
  // Url after the redirects; sfdl.net ends up here.
  finalUrl: string;
  body: string;
  // How often the javascript challenge was hit.
  challenges: number;
  error?: string;
};

// One empty page frame; callers fill the fields they have.
function result(url: string, part: Partial<Page>): Page {
  return { ok: false, status: 0, url, finalUrl: url, body: "", challenges: 0, ...part };
}

// The same frame with an error line for the window.
function failure(url: string, message: string, part: Partial<Page> = {}): Page {
  return result(url, { ...part, error: message });
}

// One fetch with the browser user agent, redirects followed to the end.
async function raw(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { "User-Agent": UA, ...init.headers },
    redirect: "follow",
  });
}

// The board declares UTF-8 but sends cp1252 bytes at places (mixed umlauts in
// forum headings). A plain utf-8 decode leaves those as U+FFFD inside names,
// titles and error messages, so the same bytes are read as windows-1252 once the
// utf-8 pass produced replacement characters.
function decode(bytes: Uint8Array): string {
  const asUtf8 = new TextDecoder("utf-8").decode(bytes);
  if (!asUtf8.includes("\uFFFD")) return asUtf8;
  return new TextDecoder("windows-1252").decode(bytes);
}

/** Absolute board url: a full url passes through, a path gets the board
    prefix. */
export function boardUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return BOARD + (path.startsWith("/") ? path : `/${path}`);
}

// Sleeps until the settings delay since the previous request has passed, then
// stamps the clock.
async function waitTurn(): Promise<void> {
  const delay = numberSetting("board_request_delay_ms");
  const since = Date.now() - lastRequest;
  if (since < delay) await Bun.sleep(delay - since);
  lastRequest = Date.now();
}

// Every board access lines up behind the previous one, so each caller waits out
// the delay in turn.
function enqueue(task: () => Promise<Page>): Promise<Page> {
  const run = queue.then(async () => {
    await waitTurn();
    return task();
  });
  queue = run.catch(() => {});
  return run;
}

/** Queued get with the challenge retries of the attempts argument, or of the
    settings row. */
export function getPage(path: string, attempts?: number): Promise<Page> {
  const tries = Math.max(1, attempts ?? numberSetting("board_challenge_attempts"));
  return enqueue(() => getPageNow(path, tries));
}

/** Queued form post, the shape of the sfdl confirmation step. */
export function postPage(path: string, fields: Record<string, string>): Promise<Page> {
  return enqueue(() => postPageNow(path, fields));
}

// Fetch, store cookies, look for the challenge. A short page carrying a
// createCookie call feeds the value into the jar and asks the url again.
async function getPageNow(path: string, attempts: number): Promise<Page> {
  const url = boardUrl(path);
  let challenges = 0;
  let status = 0;
  let body = "";
  let finalUrl = url;

  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    let response: Response;
    try {
      response = await raw(url, { headers: { Cookie: cookieHeader() } });
    } catch (error) {
      return failure(
        url,
        `Anfrage fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
        { challenges },
      );
    }

    cookiesFromResponse(response);
    body = decode(new Uint8Array(await response.arrayBuffer()));
    status = response.status;
    finalUrl = response.url || url;

    // A retry runs while the page asks for a value the jar does not carry yet,
    // and while the page stays under the byte ceiling of its settings row.
    const challenge = CHALLENGE_RE.exec(body);
    if (
      challenge &&
      body.length < numberSetting("board_challenge_max_bytes") &&
      cookieHeader() !== `mlc=${challenge[1]}`
    ) {
      setBoardCookie("mlc", challenge[1] ?? "");
      challenges += 1;
      continue;
    }

    return result(url, { ok: response.ok, status, finalUrl, body, challenges });
  }

  return failure(url, `JS-Challenge nach ${attempts} Versuchen nicht gelöst`, {
    status,
    finalUrl,
    body,
    challenges,
  });
}

// One form post with the jar attached; a thrown transport error comes back as a
// failed Page.
async function postPageNow(path: string, fields: Record<string, string>): Promise<Page> {
  const url = boardUrl(path);
  try {
    const response = await raw(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader(),
      },
      body: new URLSearchParams(fields),
    });
    cookiesFromResponse(response);
    return result(url, {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url || url,
      body: decode(new Uint8Array(await response.arrayBuffer())),
    });
  } catch (error) {
    return failure(
      url,
      `POST fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
