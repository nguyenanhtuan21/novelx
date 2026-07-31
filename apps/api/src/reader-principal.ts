import { randomUUID } from "node:crypto";

import {
  createAnonymousReaderPrincipal,
  type ReaderRequestPrincipal,
} from "@novelx/shared";

import { readerPrincipalFromToken } from "./reader-session-token.js";

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
  const token = bearerToken(input.authorization);
  const principal = token
    ? readerPrincipalFromToken({ token, secret: input.secret })
    : undefined;

  return (
    principal ?? createAnonymousReaderPrincipal({ anonymousSessionId: "" })
  );
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

function bearerToken(
  authorization: string | string[] | undefined,
): string | undefined {
  const header = (
    Array.isArray(authorization) ? authorization[0] : authorization
  )?.trim();

  if (
    !header?.toLowerCase().startsWith(`${READER_SESSION_SCHEME.toLowerCase()} `)
  ) {
    return undefined;
  }

  return header.slice(READER_SESSION_SCHEME.length + 1).trim() || undefined;
}
