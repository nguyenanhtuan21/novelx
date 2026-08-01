import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createStaffPrincipal,
  type StaffAuditRecord,
  type StaffPrincipal,
} from "@novelx/shared";

import { InMemoryStaffAuditRepository } from "./in-memory-staff-audit.repository.js";
import type { StaffAuditRepository } from "./staff-audit.repository.js";
import type { StaffAccountDirectory } from "./staff-accounts.js";
import { StaffOperationGate } from "./staff-operation-gate.js";
import { staffPrincipalFromToken } from "./staff-session-token.js";
import {
  STAFF_AUDIT_LOG_MAX_PAGE_SIZE,
  STAFF_AUDIT_LOG_PAGE_SIZE,
  StaffService,
} from "./staff.service.js";

const secret = "staff-session-secret-for-tests";
const signedInAt = "2026-07-31T08:00:00.000Z";
const editor = createStaffPrincipal({
  staffAccountId: "staff-editor-1",
  permissions: ["audit:read"],
});

const directory: StaffAccountDirectory = {
  authenticate: (input) =>
    input.staffAccountId === editor.staffAccountId &&
    input.credential === "editor-credential"
      ? editor
      : undefined,
  find: (staffAccountId) =>
    staffAccountId === editor.staffAccountId ? editor : undefined,
};

describe("staff session window", () => {
  it("runs out a fixed session after it was issued", async () => {
    process.env.STAFF_SESSION_SECRET = secret;
    const service = staffService(new InMemoryStaffAuditRepository(), {
      sessionDurationMs: 15 * 60 * 1000,
    });

    const session = await service.signIn({
      staffAccountId: "staff-editor-1",
      credential: "editor-credential",
    });

    assert.equal(session.expiresAt, "2026-07-31T08:15:00.000Z");
    assert.deepEqual(
      staffPrincipalFromToken({
        token: session.token,
        secret,
        now: "2026-07-31T08:14:59.000Z",
      }),
      editor,
    );
    assert.equal(
      staffPrincipalFromToken({
        token: session.token,
        secret,
        now: "2026-07-31T08:15:00.000Z",
      }),
      undefined,
    );
  });

  it("records the staff operation at the time it happened", async () => {
    const staffAuditRepository = new InMemoryStaffAuditRepository();
    const service = staffService(staffAuditRepository);

    await service.signIn({
      staffAccountId: "staff-editor-1",
      credential: "editor-credential",
    });

    const [record] = await staffAuditRepository.list({ limit: 1 });
    assert.equal(record?.recordedAt, signedInAt);
  });
});

describe("staff audit log paging", () => {
  it("asks for a sane page whatever the caller asked for", async () => {
    const asked: number[] = [];
    const service = staffService(recordingRepository(asked));

    for (const limit of [undefined, 0, -5, 3.7, 10, 10_000]) {
      await service.readAuditLog({
        principal: editorSession(),
        ...(limit === undefined ? {} : { limit }),
      });
    }

    assert.deepEqual(asked, [
      STAFF_AUDIT_LOG_PAGE_SIZE,
      STAFF_AUDIT_LOG_PAGE_SIZE,
      STAFF_AUDIT_LOG_PAGE_SIZE,
      3,
      10,
      STAFF_AUDIT_LOG_MAX_PAGE_SIZE,
    ]);
  });
});

function staffService(
  staffAuditRepository: StaffAuditRepository,
  options: { sessionDurationMs?: number } = {},
): StaffService {
  return new StaffService(
    directory,
    new StaffOperationGate(directory, staffAuditRepository, {
      now: () => signedInAt,
    }),
    staffAuditRepository,
    { now: () => signedInAt, ...options },
  );
}

function editorSession(): StaffPrincipal {
  return createStaffPrincipal({
    staffAccountId: editor.staffAccountId,
    permissions: editor.permissions,
  });
}

function recordingRepository(asked: number[]): StaffAuditRepository {
  return {
    record: async () => {},
    list: async (input): Promise<StaffAuditRecord[]> => {
      asked.push(input.limit);

      return [];
    },
  };
}
