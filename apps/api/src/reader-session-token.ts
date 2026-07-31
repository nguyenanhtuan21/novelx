import { createHmac, timingSafeEqual } from "node:crypto";

import {
  createAnonymousReaderPrincipal,
  createReaderPrincipal,
  type ReaderRequestPrincipal,
} from "@novelx/shared";

type ReaderSessionClaims = {
  kind: ReaderRequestPrincipal["kind"];
  id: string;
  issuedAt: string;
};

/**
 * A reader session token is `<claims>.<signature>`: the claims name the reader
 * session, and Core Platform's signature is what makes them trustworthy. The
 * token is opaque to clients — only Core Platform signs and reads it.
 */
export function signReaderSessionToken(input: {
  principal: ReaderRequestPrincipal;
  secret: string;
  issuedAt: string;
}): string {
  const claims = encodeClaims({
    kind: input.principal.kind,
    id: principalId(input.principal),
    issuedAt: input.issuedAt,
  });

  return `${claims}.${sign(claims, input.secret)}`;
}

export function readerPrincipalFromToken(input: {
  token: string;
  secret: string;
}): ReaderRequestPrincipal | undefined {
  const parts = input.token.split(".");

  if (parts.length !== 2) {
    return undefined;
  }

  const [claims, signature] = parts as [string, string];

  if (!signatureMatches(claims, signature, input.secret)) {
    return undefined;
  }

  return principalFromClaims(decodeClaims(claims));
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

function encodeClaims(claims: ReaderSessionClaims): string {
  return Buffer.from(JSON.stringify(claims)).toString("base64url");
}

function decodeClaims(claims: string): ReaderSessionClaims | undefined {
  try {
    return JSON.parse(
      Buffer.from(claims, "base64url").toString(),
    ) as ReaderSessionClaims;
  } catch {
    return undefined;
  }
}

function sign(claims: string, secret: string): string {
  return createHmac("sha256", secret).update(claims).digest("base64url");
}

function signatureMatches(
  claims: string,
  signature: string,
  secret: string,
): boolean {
  const expected = Buffer.from(sign(claims, secret));
  const actual = Buffer.from(signature);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
