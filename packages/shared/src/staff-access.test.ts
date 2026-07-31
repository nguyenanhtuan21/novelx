import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertStaffAccount,
  assertStaffPermission,
  createAnonymousReaderPrincipal,
  createReaderPrincipal,
  createStaffAuditRecord,
  createStaffPrincipal,
  StaffAccessDeniedError,
  staffAuditActor,
} from "./index.js";

describe("Staff Account authorization", () => {
  it("denies a Reader Account the staff operation", () => {
    assert.throws(
      () =>
        assertStaffPermission(
          createReaderPrincipal({ readerAccountId: "reader-1" }),
          "audit:read",
        ),
      StaffAccessDeniedError,
    );
  });

  it("denies an Anonymous Reader Session the staff operation", () => {
    assert.throws(
      () =>
        assertStaffPermission(
          createAnonymousReaderPrincipal({ anonymousSessionId: "anon-1" }),
          "audit:read",
        ),
      StaffAccessDeniedError,
    );
  });

  it("denies a request that names no principal at all", () => {
    assert.throws(
      () => assertStaffPermission(undefined, "audit:read"),
      StaffAccessDeniedError,
    );
  });

  it("denies a Staff Account without the permission the operation needs", () => {
    assert.throws(
      () =>
        assertStaffPermission(
          createStaffPrincipal({
            staffAccountId: "staff-editor-1",
            permissions: ["chapter:publish"],
          }),
          "audit:read",
        ),
      StaffAccessDeniedError,
    );
  });

  it("allows a Staff Account holding the permission", () => {
    assert.doesNotThrow(() =>
      assertStaffPermission(
        createStaffPrincipal({
          staffAccountId: "staff-editor-1",
          permissions: ["audit:read"],
        }),
        "audit:read",
      ),
    );
  });
});

describe("Staff Account boundary without a named permission", () => {
  it("admits any Staff Account but no reader session", () => {
    assert.doesNotThrow(() =>
      assertStaffAccount(
        createStaffPrincipal({
          staffAccountId: "staff-editor-1",
          permissions: [],
        }),
      ),
    );

    for (const principal of [
      createReaderPrincipal({ readerAccountId: "reader-1" }),
      createAnonymousReaderPrincipal({ anonymousSessionId: "anon-1" }),
      undefined,
    ]) {
      assert.throws(
        () => assertStaffAccount(principal),
        StaffAccessDeniedError,
      );
    }
  });
});

describe("Staff operation audit record", () => {
  it("names the actor, action, target, and time of a staff operation", () => {
    const record = createStaffAuditRecord({
      actor: staffAuditActor(
        createStaffPrincipal({
          staffAccountId: "staff-editor-1",
          permissions: ["audit:read"],
        }),
      ),
      action: "staff.audit-log.read",
      target: "staff-audit-log",
      outcome: "allowed",
      recordedAt: "2026-07-31T08:00:00.000Z",
    });

    assert.deepEqual(record, {
      actor: { kind: "staff", staffAccountId: "staff-editor-1" },
      action: "staff.audit-log.read",
      target: "staff-audit-log",
      outcome: "allowed",
      recordedAt: "2026-07-31T08:00:00.000Z",
    });
  });

  it("keeps the reader session that was refused a staff operation as evidence", () => {
    const record = createStaffAuditRecord({
      actor: staffAuditActor(
        createReaderPrincipal({ readerAccountId: "reader-1" }),
      ),
      action: "staff.audit-log.read",
      target: "staff-audit-log",
      outcome: "denied",
      recordedAt: "2026-07-31T08:00:00.000Z",
    });

    assert.deepEqual(record.actor, {
      kind: "reader",
      readerAccountId: "reader-1",
    });
    assert.equal(record.outcome, "denied");
  });

  it("names an Anonymous Reader Session and an unidentified request as actors too", () => {
    assert.deepEqual(
      staffAuditActor(
        createAnonymousReaderPrincipal({ anonymousSessionId: "anon-1" }),
      ),
      { kind: "anonymous-reader", anonymousSessionId: "anon-1" },
    );
    assert.deepEqual(staffAuditActor(undefined), { kind: "unauthenticated" });
  });

  it("refuses a record that does not say what happened to what", () => {
    const record = {
      actor: staffAuditActor(undefined),
      action: "staff.audit-log.read",
      target: "staff-audit-log",
      outcome: "denied",
      recordedAt: "2026-07-31T08:00:00.000Z",
    } as const;

    assert.throws(() => createStaffAuditRecord({ ...record, action: " " }));
    assert.throws(() => createStaffAuditRecord({ ...record, target: "" }));
  });
});
