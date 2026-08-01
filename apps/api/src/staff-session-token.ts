import { createStaffPrincipal, type StaffPrincipal } from "@novelx/shared";

import { signClaims, signedClaims } from "./signed-claims.js";

type StaffSessionClaims = {
  kind: "staff";
  staffAccountId: string;
  permissions: string[];
  issuedAt: string;
  expiresAt: string;
};

/**
 * A staff session token names the Staff Account a privileged request acts as.
 *
 * It is deliberately not a reader session token: it is signed with the staff
 * signing secret, it carries the permissions the Staff Account may act on, and
 * it runs out — staff sessions are short-lived where reader sessions are not.
 */
export function signStaffSessionToken(input: {
  principal: StaffPrincipal;
  secret: string;
  issuedAt: string;
  expiresAt: string;
}): string {
  return signClaims({
    claims: {
      kind: "staff",
      staffAccountId: input.principal.staffAccountId,
      permissions: input.principal.permissions,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    } satisfies StaffSessionClaims,
    secret: input.secret,
  });
}

export function staffPrincipalFromToken(input: {
  token: string;
  secret: string;
  now: string;
}): StaffPrincipal | undefined {
  const claims = signedClaims<StaffSessionClaims>({
    token: input.token,
    secret: input.secret,
  });

  if (claims?.kind !== "staff" || !claims.staffAccountId) {
    return undefined;
  }

  if (!Array.isArray(claims.permissions) || hasRunOut(claims, input.now)) {
    return undefined;
  }

  return createStaffPrincipal({
    staffAccountId: claims.staffAccountId,
    permissions: claims.permissions,
  });
}

/** A session window this deployment cannot read is over, not open. */
function hasRunOut(claims: StaffSessionClaims, now: string): boolean {
  const expiry = Date.parse(claims.expiresAt);
  const asked = Date.parse(now);

  return !Number.isFinite(expiry) || !Number.isFinite(asked) || expiry <= asked;
}
