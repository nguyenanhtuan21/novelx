/**
 * The reader session cookie holds a Core Platform reader session token. It is
 * HttpOnly on purpose: page scripts must not be able to read or forge the
 * reader's identity, they call the same-origin `/api/reader` routes instead.
 */
export const READER_SESSION_COOKIE = "novelx-reader-session";

export const READER_SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function readerSessionCookie(token: string) {
  return {
    name: READER_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: READER_SESSION_COOKIE_MAX_AGE,
  } as const;
}
