// Board login: user + password in, session cookies out.
//
// vBulletin 3 flow: the security token comes off a forum page, the credentials
// go to /login.php?do=login. Success means a user cookie arrived, bb_userid or a
// *_vbuserid name, in the login answer itself or on one of the redirect hops.
// Every cookie lands under the board_cookie_ settings prefix, and the password
// stays in its own settings row.
//
// The post and its hops run their own fetch with manual redirects, so the
// challenge is solved once by hand on this path.

import type { BoardSession } from "@shared/types/settings";
import { BOARD_PASSWORD_KEY, BOARD_USER_KEY } from "../settings/keys";
import { secretSet, setting, settingOf } from "../settings/store";
import {
  BOARD,
  CHALLENGE_RE,
  cookieHeader,
  cookieSet,
  cookiesFromResponse,
  setBoardCookie,
  UA,
} from "./cookies";
import { errorText } from "./html";
import { getPage } from "./http";

export function boardUser(): string {
  return setting(BOARD_USER_KEY);
}

/** The board session as the surfaces show it: stored user, cookie presence,
    password presence. */
export function sessionState(): BoardSession {
  return {
    user: boardUser(),
    cookieSet: cookieSet(),
    passwordSet: secretSet(BOARD_PASSWORD_KEY),
  };
}

/** True when a cookie name carries the board user id. */
function hasUserCookie(names: string[]): boolean {
  return names.some((name) => name === "bb_userid" || name.endsWith("_vbuserid"));
}

// Redirects stay manual, so the Set-Cookie header of every answer is read on
// its own; the session is built over several hops.
async function raw(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { "User-Agent": UA, ...init.headers },
    redirect: "manual",
  });
}

/**
 * Posts the login form, solves the cookie challenge once, then walks the
 * redirect hops. A user cookie ends the run; else the board error line comes
 * back, or a line naming status and cookie names.
 */
export async function boardLogin(
  user: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!user.trim() || !password) return { ok: false, error: "Benutzername und Passwort angeben." };

  // The token is a form field of the forum page; a page without one leaves the
  // guest value in place.
  const forum = await getPage("/forum.php");
  const token = /name="securitytoken"\s+value="([^"]+)"/.exec(forum.body)?.[1] ?? "guest";

  const form = new URLSearchParams({
    vb_login_username: user.trim(),
    vb_login_password: password,
    cookieuser: "1",
    s: "",
    securitytoken: token,
    do: "login",
    vb_login_md5password: "",
    vb_login_md5password_utf: "",
  });

  let response = await raw(`${BOARD}/login.php?do=login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader() },
    body: form,
  });
  let html = await response.text();

  // A second post runs when the answer set zero cookies, stays under 3000 bytes,
  // and asks for an mlc value the jar holds different.
  const challenge = CHALLENGE_RE.exec(html);
  if (
    challenge &&
    response.headers.getSetCookie().length === 0 &&
    html.length < 3000 &&
    challenge[1] !== cookieHeader().match(/(?:^|;\s*)mlc=([^;]*)/)?.[1]
  ) {
    setBoardCookie("mlc", challenge[1] ?? "");
    response = await raw(`${BOARD}/login.php?do=login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader() },
      body: form,
    });
    html = await response.text();
  }

  let names = cookiesFromResponse(response);

  // Hops are followed while a user cookie is to wait for, three at most.
  let target = response.headers.get("location");
  let hops = 0;
  while (!hasUserCookie(names) && target && hops < 3) {
    response = await raw(new URL(target, BOARD).href, { headers: { Cookie: cookieHeader() } });
    html = await response.text();
    names = cookiesFromResponse(response);
    target = response.headers.get("location");
    hops += 1;
  }

  if (hasUserCookie(names)) return { ok: true };

  // The board's own error line wins; else the line names status and the cookie
  // names that arrived.
  return {
    ok: false,
    error:
      errorText(html) ??
      `Login fehlgeschlagen — kein bb_userid-Cookie. (HTTP ${response.status}, Cookies: ${
        names.length ? names.join(", ") : "keine"
      })`,
  };
}

// Login with the credentials of the settings rows.
export async function loginFromSettings(): Promise<{ ok: boolean; error?: string }> {
  const user = boardUser();
  const password = settingOf(BOARD_PASSWORD_KEY);
  if (!user || !password) return { ok: false, error: "Kein Board-Zugang in den Einstellungen." };
  return boardLogin(user, password);
}
