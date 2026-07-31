import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAnonymousReaderPrincipal,
  createReaderPrincipal,
} from "@novelx/shared";

import {
  readerPrincipalFromToken,
  signReaderSessionToken,
} from "./reader-session-token.js";

const secret = "reader-session-secret-for-tests";

describe("Reader session token", () => {
  it("names the Reader Account it was issued for", () => {
    const token = signReaderSessionToken({
      principal: createReaderPrincipal({ readerAccountId: "reader-1" }),
      secret,
      issuedAt: "2026-07-31T08:00:00.000Z",
    });

    assert.deepEqual(readerPrincipalFromToken({ token, secret }), {
      kind: "reader",
      readerAccountId: "reader-1",
    });
  });

  it("names the Anonymous Reader Session it was issued for", () => {
    const token = signReaderSessionToken({
      principal: createAnonymousReaderPrincipal({
        anonymousSessionId: "anon-1",
      }),
      secret,
      issuedAt: "2026-07-31T08:00:00.000Z",
    });

    assert.deepEqual(readerPrincipalFromToken({ token, secret }), {
      kind: "anonymous-reader",
      anonymousSessionId: "anon-1",
    });
  });

  it("refuses a token whose reader was swapped after signing", () => {
    const token = signReaderSessionToken({
      principal: createReaderPrincipal({ readerAccountId: "reader-1" }),
      secret,
      issuedAt: "2026-07-31T08:00:00.000Z",
    });
    const [, signature] = token.split(".");
    const forged = `${Buffer.from(
      JSON.stringify({
        kind: "reader",
        id: "reader-2",
        issuedAt: "2026-07-31T08:00:00.000Z",
      }),
    ).toString("base64url")}.${signature}`;

    assert.equal(
      readerPrincipalFromToken({ token: forged, secret }),
      undefined,
    );
  });

  it("refuses a token signed with another secret, and junk", () => {
    const token = signReaderSessionToken({
      principal: createReaderPrincipal({ readerAccountId: "reader-1" }),
      secret: "some-other-deployment-secret",
      issuedAt: "2026-07-31T08:00:00.000Z",
    });

    assert.equal(readerPrincipalFromToken({ token, secret }), undefined);
    assert.equal(readerPrincipalFromToken({ token: "", secret }), undefined);
    assert.equal(
      readerPrincipalFromToken({ token: "not-a-token", secret }),
      undefined,
    );
    assert.equal(
      readerPrincipalFromToken({ token: "a.b.c", secret }),
      undefined,
    );
  });
});
