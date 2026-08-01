import { Injectable, UnauthorizedException } from "@nestjs/common";
import {
  STAFF_ACCESS_REQUIRED,
  type RequestPrincipal,
  type StaffAuditRecord,
} from "@novelx/shared";

import type { StaffAccountDirectory } from "./staff-accounts.js";
import type { StaffAuditRepository } from "./staff-audit.repository.js";
import {
  staffAuditTarget,
  type StaffOperation,
  StaffOperationGate,
} from "./staff-operation-gate.js";
import { staffSessionSecret } from "./staff-principal.js";
import { signStaffSessionToken } from "./staff-session-token.js";

export const STAFF_AUDIT_LOG_TARGET = "staff-audit-log";
export const STAFF_AUDIT_LOG_PAGE_SIZE = 50;
export const STAFF_AUDIT_LOG_MAX_PAGE_SIZE = 500;

/** Staff sessions are short-lived where reader sessions are not. */
export const STAFF_SESSION_DURATION_MS = 30 * 60 * 1000;

export type StaffSession = {
  staffAccountId: string;
  permissions: string[];
  token: string;
  expiresAt: string;
};

export type StaffServiceOptions = {
  now?: () => string;
  sessionDurationMs?: number;
};

type SessionWindow = { issuedAt: string; expiresAt: string };

/**
 * The Staff Account boundary: the one place a request becomes staff, and where
 * a staff session says which account it names.
 */
@Injectable()
export class StaffService {
  private readonly now: () => string;
  private readonly sessionDurationMs: number;

  constructor(
    private readonly staffAccounts: StaffAccountDirectory,
    private readonly gate: StaffOperationGate,
    private readonly staffAuditRepository: StaffAuditRepository,
    options: StaffServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.sessionDurationMs =
      options.sessionDurationMs ?? STAFF_SESSION_DURATION_MS;
  }

  /**
   * Exchanges a staff access credential for a staff session, on the staff
   * boundary only: no reader session token opens one, and holding one is the
   * only way to reach a staff operation.
   */
  async signIn(input: {
    staffAccountId: unknown;
    credential: unknown;
    /** Whoever presented the request, kept as evidence when it is refused. */
    presented?: RequestPrincipal;
  }): Promise<StaffSession> {
    const staffAccountId =
      typeof input.staffAccountId === "string" ? input.staffAccountId : "";
    const credential =
      typeof input.credential === "string" ? input.credential : "";
    const principal = staffAccountId
      ? this.staffAccounts.authenticate({ staffAccountId, credential })
      : undefined;
    const operation: StaffOperation = {
      action: "staff.session.sign-in",
      target: staffAuditTarget("staff-account", staffAccountId),
    };

    if (!principal) {
      await this.gate.record(input.presented, operation, "denied");

      throw new UnauthorizedException({
        error: STAFF_ACCESS_REQUIRED,
        message: "Staff Account credential was not accepted",
      });
    }

    const session = this.sessionWindow();
    await this.gate.record(principal, operation, "allowed");

    return {
      staffAccountId: principal.staffAccountId,
      permissions: principal.permissions,
      token: signStaffSessionToken({
        principal,
        secret: staffSessionSecret(),
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
      }),
      expiresAt: session.expiresAt,
    };
  }

  /**
   * The Staff Account a staff session names, for a client to show its operator.
   * Reading your own session is not privileged, so only refusals are recorded.
   */
  async currentSession(input: { principal: RequestPrincipal }): Promise<{
    staffAccountId: string;
    permissions: string[];
  }> {
    const principal = await this.gate.authorize(input.principal, {
      action: "staff.session.read",
      target: "staff-session",
    });

    return {
      staffAccountId: principal.staffAccountId,
      permissions: principal.permissions,
    };
  }

  async readAuditLog(input: {
    principal: RequestPrincipal;
    limit?: number;
  }): Promise<{ records: StaffAuditRecord[] }> {
    return this.gate.run(
      input.principal,
      {
        action: "staff.audit-log.read",
        target: STAFF_AUDIT_LOG_TARGET,
        permission: "audit:read",
      },
      async () => ({
        records: await this.staffAuditRepository.list({
          limit: auditLogPageSize(input.limit),
        }),
      }),
    );
  }

  private sessionWindow(): SessionWindow {
    const issuedAt = this.now();

    return {
      issuedAt,
      expiresAt: new Date(
        Date.parse(issuedAt) + this.sessionDurationMs,
      ).toISOString(),
    };
  }
}

function auditLogPageSize(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit) || limit < 1) {
    return STAFF_AUDIT_LOG_PAGE_SIZE;
  }

  return Math.min(Math.floor(limit), STAFF_AUDIT_LOG_MAX_PAGE_SIZE);
}
