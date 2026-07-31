import {
  createAnonymousReaderPrincipal,
  createReaderPrincipal,
  type ReaderRequestPrincipal,
} from "@novelx/shared";

import { signClaims, signedClaims } from "./signed-claims.js";

type ReaderSessionClaims = {
  kind: ReaderRequestPrincipal["kind"];
  id: string;
  issuedAt: string;
};

/**
 * A reader session token names the reader session a reader-facing request
 * belongs to. The claims name the reader session, and Core Platform's signature
 * is what makes them trustworthy; the token is opaque to clients.
 */
export function signReaderSessionToken(input: {
  principal: ReaderRequestPrincipal;
  secret: string;
  issuedAt: string;
}): string {
  return signClaims({
    claims: {
      kind: input.principal.kind,
      id: principalId(input.principal),
      issuedAt: input.issuedAt,
    } satisfies ReaderSessionClaims,
    secret: input.secret,
  });
}

export function readerPrincipalFromToken(input: {
  token: string;
  secret: string;
}): ReaderRequestPrincipal | undefined {
  return principalFromClaims(
    signedClaims<ReaderSessionClaims>({
      token: input.token,
      secret: input.secret,
    }),
  );
}

function principalId(principal: ReaderRequestPrincipal): string {
  return principal.kind === "reader"
    ? principal.readerAccountId
    : principal.anonymousSessionId;
}

function principalFromClaims(
  claims: ReaderSessionClaims | undefined,
): ReaderRequestPrincipal | undefined {
  if (!claims?.id) {
    return undefined;
  }

  if (claims.kind === "reader") {
    return createReaderPrincipal({ readerAccountId: claims.id });
  }

  if (claims.kind === "anonymous-reader") {
    return createAnonymousReaderPrincipal({ anonymousSessionId: claims.id });
  }

  return undefined;
}
