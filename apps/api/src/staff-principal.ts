import { randomUUID } from "node:crypto";

import type { RequestPrincipal, StaffPrincipal } from "@novelx/shared";

import {
  namedReaderPrincipal,
  readerSessionSecret,
} from "./reader-principal.js";
import { schemeToken } from "./session-header.js";
import { staffPrincipalFromToken } from "./staff-session-token.js";

/**
 * Staff sessions travel on their own header under their own scheme, so a staff
 * request is never merely a reader request with extra claims, and a reader
 * client cannot present a staff session by accident.
 */
export const STAFF_SESSION_HEADER = "x-staff-authorization";
export const STAFF_SESSION_SCHEME = "Staff";

/**
 * Resolves the Staff Account a privileged request acts as, or nothing at all.
 *
 * Nothing here falls back to a reader identity: a request the staff boundary
 * cannot name as a Staff Account names no staff, whatever else it carries.
 */
export function staffRequestPrincipal(input: {
  staffAuthorization: string | string[] | undefined;
  secret: string;
  now: string;
}): StaffPrincipal | undefined {
  const token = schemeToken(input.staffAuthorization, STAFF_SESSION_SCHEME);

  return token
    ? staffPrincipalFromToken({ token, secret: input.secret, now: input.now })
    : undefined;
}

/**
 * Names whoever a request on the staff boundary presented.
 *
 * Only the staff header can produce a Staff Account. A reader session token is
 * resolved solely so a refused attempt is audited as the reader session it came
 * from, and never so that it counts towards staff access.
 */
export function staffBoundaryPrincipal(input: {
  staffAuthorization: string | undefined;
  authorization: string | undefined;
}): RequestPrincipal {
  return (
    staffRequestPrincipal({
      staffAuthorization: input.staffAuthorization,
      secret: staffSessionSecret(),
      now: new Date().toISOString(),
    }) ??
    namedReaderPrincipal({
      authorization: input.authorization,
      secret: readerSessionSecret(),
    })
  );
}

/**
 * The signing secret for staff session tokens, kept separate from the reader
 * one so that neither boundary can mint the other's credential. A deployment
 * without `STAFF_SESSION_SECRET` gets a per-process secret, which means staff
 * sessions do not survive a restart.
 */
export function staffSessionSecret(): string {
  return (process.env.STAFF_SESSION_SECRET ??= randomUUID());
}
