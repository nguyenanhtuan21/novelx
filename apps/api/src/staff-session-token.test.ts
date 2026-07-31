import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createReaderPrincipal, createStaffPrincipal } from "@novelx/shared";

import {
  readerPrincipalFromToken,
  signReaderSessionToken,
} from "./reader-session-token.js";
import {
  signStaffSessionToken,
  staffPrincipalFromToken,
} from "./staff-session-token.js";

const secret = "staff-session-secret-for-tests";
const issuedAt = "2026-07-31T08:00:00.000Z";
const expiresAt = "2026-07-31T08:30:00.000Z";
const duringSession = "2026-07-31T08:29:00.000Z";
const afterSession = "2026-07-31T08:30:01.000Z";

const staffToken = signStaffSessionToken({
  principal: createStaffPrincipal({
    staffAccountId: "staff-editor-1",
    permissions: ["audit:read"],
  }),
  secret,
  issuedAt,
  expiresAt,
});

describe("Staff session token", () => {
  it("names the Staff Account and the permissions it was issued for", () => {
    assert.deepEqual(
      staffPrincipalFromToken({
        token: staffToken,
        secret,
        now: duringSession,
      }),
      {
        kind: "staff",
        staffAccountId: "staff-editor-1",
        permissions: ["audit:read"],
      },
    );
  });

  it("refuses a token whose Staff Account or permissions were swapped after signing", () => {
    const [, signature] = staffToken.split(".");

    for (const claims of [
      { staffAccountId: "staff-admin-9", permissions: ["audit:read"] },
      {
        staffAccountId: "staff-editor-1",
        permissions: ["audit:read", "chapter:publish"],
      },
    ]) {
      const forged = `${Buffer.from(
        JSON.stringify({ kind: "staff", ...claims, issuedAt, expiresAt }),
      ).toString("base64url")}.${signature}`;

      assert.equal(
        staffPrincipalFromToken({ token: forged, secret, now: duringSession }),
        undefined,
      );
    }
  });

  it("refuses a token signed with another secret, and junk", () => {
    assert.equal(
      staffPrincipalFromToken({
        token: signStaffSessionToken({
          principal: createStaffPrincipal({
            staffAccountId: "staff-editor-1",
            permissions: ["audit:read"],
          }),
          secret: "an-attacker-secret",
          issuedAt,
          expiresAt,
        }),
        secret,
        now: duringSession,
      }),
      undefined,
    );

    for (const token of ["", "staff-editor-1", "not-a-token", "a.b.c"]) {
      assert.equal(
        staffPrincipalFromToken({ token, secret, now: duringSession }),
        undefined,
      );
    }
  });

  it("refuses a staff session that has run out, unlike a reader session", () => {
    assert.equal(
      staffPrincipalFromToken({
        token: staffToken,
        secret,
        now: afterSession,
      }),
      undefined,
    );
  });
});

describe("reader and staff session tokens are different credentials", () => {
  it("refuses a reader session token at the staff boundary, even under the staff secret", () => {
    const readerToken = signReaderSessionToken({
      principal: createReaderPrincipal({ readerAccountId: "reader-1" }),
      secret,
      issuedAt,
    });

    assert.equal(
      staffPrincipalFromToken({
        token: readerToken,
        secret,
        now: duringSession,
      }),
      undefined,
    );
  });

  it("refuses a staff session token at the reader boundary", () => {
    assert.equal(
      readerPrincipalFromToken({ token: staffToken, secret }),
      undefined,
    );
  });
});
