import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A signed session token is `<claims>.<signature>`: base64url claims plus Core
 * Platform's HMAC over them, which is what makes the claims trustworthy.
 *
 * The reader and staff boundaries share this shape but not their signing
 * secret, so a token issued for one is not a credential at the other.
 */
export function signClaims(input: { claims: object; secret: string }): string {
  const claims = Buffer.from(JSON.stringify(input.claims)).toString(
    "base64url",
  );

  return `${claims}.${sign(claims, input.secret)}`;
}

/** The claims of a token this deployment signed, or nothing at all. */
export function signedClaims<TClaims>(input: {
  token: string;
  secret: string;
}): TClaims | undefined {
  const parts = input.token.split(".");

  if (parts.length !== 2) {
    return undefined;
  }

  const [claims, signature] = parts as [string, string];

  if (!signatureMatches(claims, signature, input.secret)) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.from(claims, "base64url").toString()) as TClaims;
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
