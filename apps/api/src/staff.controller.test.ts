import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createAnonymousReaderPrincipal,
  createReaderPrincipal,
  type ReaderRequestPrincipal,
  type StaffAuditRecord,
} from "@novelx/shared";

import { restoreEnv, withApi, type ApiClient } from "./api-test-client.js";
import { signReaderSessionToken } from "./reader-session-token.js";

const credential = "staff-editor-1-access-credential";
const moderatorCredential = "staff-moderator-1-access-credential";
const readerSecret = "reader-session-secret-for-tests";
const staffAccounts = JSON.stringify([
  {
    id: "staff-editor-1",
    permissions: ["audit:read"],
    credentialSha256: createHash("sha256").update(credential).digest("hex"),
  },
  {
    id: "staff-moderator-1",
    permissions: ["series:takedown"],
    credentialSha256: createHash("sha256")
      .update(moderatorCredential)
      .digest("hex"),
  },
]);

const originalEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  READER_SESSION_SECRET: process.env.READER_SESSION_SECRET,
  STAFF_ACCOUNTS: process.env.STAFF_ACCOUNTS,
  STAFF_SESSION_SECRET: process.env.STAFF_SESSION_SECRET,
};

const readerHeaders = readerSessionHeaders(
  createReaderPrincipal({ readerAccountId: "reader-1" }),
);

describe("Staff Account boundary", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.STAFF_ACCOUNTS = staffAccounts;
    process.env.STAFF_SESSION_SECRET = "staff-session-secret-for-tests";
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(originalEnv)) {
      restoreEnv(name, value);
    }
  });

  it("signs a Staff Account in and lets it read the staff audit log", async () => {
    await withApi(async (api) => {
      const signedIn = await api<{
        staffAccountId: string;
        permissions: string[];
        token: string;
        expiresAt: string;
      }>("POST", "/staff/sessions", {
        body: { staffAccountId: "staff-editor-1", credential },
      });

      assert.equal(signedIn.status, 201);
      assert.equal(signedIn.body.staffAccountId, "staff-editor-1");
      assert.deepEqual(signedIn.body.permissions, ["audit:read"]);
      assert.ok(signedIn.body.token);

      const auditLog = await api<{ records: StaffAuditRecord[] }>(
        "GET",
        "/staff/audit-log",
        { headers: staffHeaders(signedIn.body.token) },
      );

      assert.equal(auditLog.status, 200);
      assert.deepEqual(
        auditLog.body.records.map((record) => [
          record.actor,
          record.action,
          record.target,
          record.outcome,
        ]),
        [
          [
            { kind: "staff", staffAccountId: "staff-editor-1" },
            "staff.audit-log.read",
            "staff-audit-log",
            "allowed",
          ],
          [
            { kind: "staff", staffAccountId: "staff-editor-1" },
            "staff.session.sign-in",
            "staff-account:staff-editor-1",
            "allowed",
          ],
        ],
      );
      assert.ok(
        Date.parse(auditLog.body.records[0]?.recordedAt ?? "") > 0,
        "staff audit records are timestamped",
      );
    });
  });

  it("holds a signed-in Staff Account to the permissions it was issued", async () => {
    await withApi(async (api) => {
      const signedIn = await api<{ permissions: string[]; token: string }>(
        "POST",
        "/staff/sessions",
        {
          body: {
            staffAccountId: "staff-moderator-1",
            credential: moderatorCredential,
          },
        },
      );
      assert.deepEqual(signedIn.body.permissions, ["series:takedown"]);

      const session = await api<{ staffAccountId: string }>(
        "GET",
        "/staff/session",
        { headers: staffHeaders(signedIn.body.token) },
      );
      assert.equal(session.status, 200);
      assert.equal(session.body.staffAccountId, "staff-moderator-1");

      const refused = await api<{ error: string }>("GET", "/staff/audit-log", {
        headers: staffHeaders(signedIn.body.token),
      });
      assert.equal(refused.status, 403);
      assert.equal(refused.body.error, "staff-access-required");

      const { records } = await staffAuditLog(api);
      const refusal = records.find((record) => record.outcome === "denied");

      assert.deepEqual(refusal, {
        actor: { kind: "staff", staffAccountId: "staff-moderator-1" },
        action: "staff.audit-log.read",
        target: "staff-audit-log",
        outcome: "denied",
        recordedAt: refusal?.recordedAt ?? "",
      });
    });
  });

  it("refuses a credential the deployment did not provision", async () => {
    await withApi(async (api) => {
      for (const body of [
        { staffAccountId: "staff-editor-1", credential: "guessed-credential" },
        { staffAccountId: "staff-nobody", credential },
        {},
      ]) {
        const refused = await api<{ error: string }>(
          "POST",
          "/staff/sessions",
          {
            body,
          },
        );

        assert.equal(refused.status, 401, JSON.stringify(body));
        assert.equal(refused.body.error, "staff-access-required");
      }

      const { records } = await staffAuditLog(api);
      assert.deepEqual(
        records
          .slice(0, 3)
          .map((record) => [record.actor, record.target, record.outcome]),
        [
          [
            { kind: "unauthenticated" },
            "staff-account:staff-editor-1",
            "denied",
          ],
          [{ kind: "unauthenticated" }, "staff-account:staff-nobody", "denied"],
          [{ kind: "unauthenticated" }, "staff-account:unnamed", "denied"],
        ],
      );
    });
  });

  it("gives a deployment that provisions no Staff Account no staff access", async () => {
    delete process.env.STAFF_ACCOUNTS;

    await withApi(async (api) => {
      const refused = await api<{ error: string }>("POST", "/staff/sessions", {
        body: { staffAccountId: "staff-editor-1", credential },
      });

      assert.equal(refused.status, 401);
      assert.equal(refused.body.error, "staff-access-required");
    });
  });
});

describe("reader access is not staff access", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.STAFF_ACCOUNTS = staffAccounts;
    process.env.STAFF_SESSION_SECRET = "staff-session-secret-for-tests";
    process.env.READER_SESSION_SECRET = readerSecret;
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(originalEnv)) {
      restoreEnv(name, value);
    }
  });

  it("refuses a Reader Account session the staff operation, and keeps the attempt", async () => {
    await withApi(async (api) => {
      const refused = await api<{ error: string }>("GET", "/staff/audit-log", {
        headers: readerHeaders,
      });

      assert.equal(refused.status, 401);
      assert.equal(refused.body.error, "staff-access-required");

      const { records } = await staffAuditLog(api);
      const attempt = records[0];

      assert.deepEqual(attempt?.actor, {
        kind: "reader",
        readerAccountId: "reader-1",
      });
      assert.equal(attempt?.action, "staff.audit-log.read");
      assert.equal(attempt?.target, "staff-audit-log");
      assert.equal(attempt?.outcome, "denied");
    });
  });

  it("refuses an Anonymous Reader Session and an unidentified request too", async () => {
    await withApi(async (api) => {
      const anonymous = await api<{ error: string }>("GET", "/staff/session", {
        headers: readerSessionHeaders(
          createAnonymousReaderPrincipal({ anonymousSessionId: "anon-1" }),
        ),
      });
      assert.equal(anonymous.status, 401);
      assert.equal(anonymous.body.error, "staff-access-required");

      const unidentified = await api<{ error: string }>(
        "GET",
        "/staff/audit-log",
      );
      assert.equal(unidentified.status, 401);
      assert.equal(unidentified.body.error, "staff-access-required");

      const { records } = await staffAuditLog(api);
      assert.deepEqual(
        records.map((record) => [record.actor, record.action, record.outcome]),
        [
          [
            { kind: "anonymous-reader", anonymousSessionId: "anon-1" },
            "staff.session.read",
            "denied",
          ],
          [{ kind: "unauthenticated" }, "staff.audit-log.read", "denied"],
          [
            { kind: "staff", staffAccountId: "staff-editor-1" },
            "staff.session.sign-in",
            "allowed",
          ],
          [
            { kind: "staff", staffAccountId: "staff-editor-1" },
            "staff.audit-log.read",
            "allowed",
          ],
        ],
      );
    });
  });

  it("keeps the reader session that went knocking at staff sign-in", async () => {
    await withApi(async (api) => {
      const refused = await api<{ error: string }>("POST", "/staff/sessions", {
        headers: readerHeaders,
        body: { staffAccountId: "staff-editor-1", credential: "guessed" },
      });
      assert.equal(refused.status, 401);

      const { records } = await staffAuditLog(api);
      assert.deepEqual(records[0]?.actor, {
        kind: "reader",
        readerAccountId: "reader-1",
      });
      assert.equal(records[0]?.action, "staff.session.sign-in");
      assert.equal(records[0]?.outcome, "denied");
    });
  });

  it("stops honouring a staff session the deployment no longer provisions", async () => {
    let token = "";

    await withApi(async (api) => {
      const signedIn = await api<{ token: string }>("POST", "/staff/sessions", {
        body: { staffAccountId: "staff-editor-1", credential },
      });
      token = signedIn.body.token;
    });

    process.env.STAFF_ACCOUNTS = JSON.stringify([
      {
        id: "staff-editor-1",
        permissions: [],
        credentialSha256: createHash("sha256").update(credential).digest("hex"),
      },
    ]);
    await withApi(async (api) => {
      const narrowed = await api<{ error: string }>("GET", "/staff/audit-log", {
        headers: staffHeaders(token),
      });

      assert.equal(narrowed.status, 403);
      assert.equal(narrowed.body.error, "staff-access-required");
    });

    process.env.STAFF_ACCOUNTS = JSON.stringify([]);
    await withApi(async (api) => {
      const deprovisioned = await api<{ error: string }>(
        "GET",
        "/staff/session",
        { headers: staffHeaders(token) },
      );

      assert.equal(deprovisioned.status, 401);
      assert.equal(deprovisioned.body.error, "staff-access-required");
    });
  });

  it("refuses a reader session token replayed on the staff header", async () => {
    await withApi(async (api) => {
      const replayed = await api<{ error: string }>("GET", "/staff/audit-log", {
        headers: {
          "x-staff-authorization": `Staff ${
            readerHeaders.authorization?.split(" ")[1]
          }`,
        },
      });

      assert.equal(replayed.status, 401);
      assert.equal(replayed.body.error, "staff-access-required");
    });
  });

  it("refuses a staff session token at the reader boundary", async () => {
    await withApi(async (api) => {
      const signedIn = await api<{ token: string }>("POST", "/staff/sessions", {
        body: { staffAccountId: "staff-editor-1", credential },
      });

      const library = await api<{ error: string }>("GET", "/reader/library", {
        headers: { authorization: `Bearer ${signedIn.body.token}` },
      });

      assert.equal(library.status, 401);
      assert.equal(library.body.error, "reader-account-upgrade-required");
    });
  });
});

/** Signs in as staff and reads the audit log, oldest record first. */
async function staffAuditLog(
  api: ApiClient,
): Promise<{ records: StaffAuditRecord[] }> {
  const signedIn = await api<{ token: string }>("POST", "/staff/sessions", {
    body: { staffAccountId: "staff-editor-1", credential },
  });
  const auditLog = await api<{ records: StaffAuditRecord[] }>(
    "GET",
    "/staff/audit-log",
    { headers: staffHeaders(signedIn.body.token) },
  );

  return { records: [...auditLog.body.records].reverse() };
}

function staffHeaders(token: string): Record<string, string> {
  return { "x-staff-authorization": `Staff ${token}` };
}

function readerSessionHeaders(
  principal: ReaderRequestPrincipal,
): Record<string, string> {
  return {
    authorization: `Bearer ${signReaderSessionToken({
      principal,
      secret: readerSecret,
      issuedAt: "2026-07-31T08:00:00.000Z",
    })}`,
  };
}
