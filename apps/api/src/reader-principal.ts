import { randomUUID } from "node:crypto";

import {
  createAnonymousReaderPrincipal,
  type ReaderRequestPrincipal,
} from "@novelx/shared";

import { readerPrincipalFromToken } from "./reader-session-token.js";
import { schemeToken } from "./session-header.js";

export const READER_SESSION_SCHEME = "Bearer";

/**
 * Resolves the reader-facing principal from a signed reader session token.
 *
 * A request with no token, or with one this deployment did not sign, is an
 * unidentified Anonymous Reader Session: it may read public content and start
 * a session, and the reader boundary answers account-only behavior with an
 * upgrade prompt. Nothing in the request names a Reader Account on its own.
 */
export function readerRequestPrincipal(input: {
  authorization: string | string[] | undefined;
  secret: string;
}): ReaderRequestPrincipal {
  const token = schemeToken(input.authorization, READER_SESSION_SCHEME);
  const principal = token
    ? readerPrincipalFromToken({ token, secret: input.secret })
    : undefined;

  return (
    principal ?? createAnonymousReaderPrincipal({ anonymousSessionId: "" })
  );
}

/**
 * The reader session a request names, or nothing when it names none.
 *
 * `readerRequestPrincipal` answers an unnamed request with an unidentified
 * Anonymous Reader Session, which is what the reader boundary needs; callers
 * that only want to know who is there — the staff boundary auditing a refused
 * attempt, say — want the distinction kept.
 */
export function namedReaderPrincipal(input: {
  authorization: string | string[] | undefined;
  secret: string;
}): ReaderRequestPrincipal | undefined {
  const principal = readerRequestPrincipal(input);

  return principal.kind === "anonymous-reader" && !principal.anonymousSessionId
    ? undefined
    : principal;
}

/**
 * The signing secret for reader session tokens. Deployments must set
 * `READER_SESSION_SECRET`; a local run without one gets a per-process secret,
 * which means reader sessions do not survive a restart — the same trade-off
 * the in-memory reader library repository already makes.
 */
export function readerSessionSecret(): string {
  return (process.env.READER_SESSION_SECRET ??= randomUUID());
}
