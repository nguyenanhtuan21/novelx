import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  assertStaffAccount,
  assertStaffPermission,
  createStaffAuditRecord,
  STAFF_ACCESS_REQUIRED,
  StaffAccessDeniedError,
  staffAuditActor,
  type RequestPrincipal,
  type StaffAuditRecord,
  type StaffPrincipal,
} from "@novelx/shared";

import type { StaffAccountDirectory } from "./staff-accounts.js";
import type { StaffAuditRepository } from "./staff-audit.repository.js";
import { staffSessionSecret } from "./staff-principal.js";
import { signStaffSessionToken } from "./staff-session-token.js";

export const STAFF_AUDIT_LOG_TARGET = "staff-audit-log";
export const STAFF_AUDIT_LOG_PAGE_SIZE = 50;
export const STAFF_AUDIT_LOG_MAX_PAGE_SIZE = 500;

/** Staff sessions are short-lived where reader sessions are not. */
export const STAFF_SESSION_DURATION_MS = 30 * 60 * 1000;

/**
 * An audit target is written from what a request claimed, so it is bounded here
 * rather than letting an unauthenticated caller decide how much staff read.
 */
const STAFF_AUDIT_TARGET_LIMIT = 64;

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

type StaffOperation = {
  action: string;
  target: string;
  /** Omitted for operations any Staff Account may perform on itself. */
  permission?: string;
};

type SessionWindow = { issuedAt: string; expiresAt: string };

/**
 * The Staff Account boundary: the one place a request becomes staff, and the
 * one place privileged staff operations are recorded.
 *
 * Every operation here goes through one permission gate and leaves an audit
 * record naming actor, action, target, outcome, and time — including when a
 * reader session or an unidentified request is refused.
 */
@Injectable()
export class StaffService {
  private readonly now: () => string;
  private readonly sessionDurationMs: number;

  constructor(
    private readonly staffAccounts: StaffAccountDirectory,
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
      target: staffAccountTarget(staffAccountId),
    };

    if (!principal) {
      await this.audit(input.presented, operation, "denied");

      throw new UnauthorizedException({
        error: STAFF_ACCESS_REQUIRED,
        message: "Staff Account credential was not accepted",
      });
    }

    const session = this.sessionWindow();
    await this.audit(principal, operation, "allowed");

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
    const principal = await this.authorize(input.principal, {
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
    const operation: StaffOperation = {
      action: "staff.audit-log.read",
      target: STAFF_AUDIT_LOG_TARGET,
      permission: "audit:read",
    };
    const principal = await this.authorize(input.principal, operation);

    // Recorded before the records are served, so a read cannot complete
    // without leaving its own trace.
    await this.audit(principal, operation, "allowed");

    return {
      records: await this.staffAuditRepository.list({
        limit: auditLogPageSize(input.limit),
      }),
    };
  }

  /**
   * Lets a staff operation through, or records the refusal before raising it —
   * a refused attempt is exactly the thing an audit trail exists to keep.
   *
   * Permissions come from the directory rather than the token, so an account
   * that has been deprovisioned, or had a permission taken away, loses it on
   * its next request instead of when its session runs out.
   */
  private async authorize(
    presented: RequestPrincipal,
    operation: StaffOperation,
  ): Promise<StaffPrincipal> {
    const principal =
      presented?.kind === "staff"
        ? this.staffAccounts.find(presented.staffAccountId)
        : presented;

    try {
      if (operation.permission === undefined) {
        assertStaffAccount(principal);
      } else {
        assertStaffPermission(principal, operation.permission);
      }

      return principal;
    } catch (error) {
      if (!(error instanceof StaffAccessDeniedError)) {
        throw error;
      }

      await this.audit(presented, operation, "denied");

      throw error.authenticated
        ? new ForbiddenException({
            error: STAFF_ACCESS_REQUIRED,
            message: error.message,
          })
        : new UnauthorizedException({
            error: STAFF_ACCESS_REQUIRED,
            message: error.message,
          });
    }
  }

  private async audit(
    principal: RequestPrincipal,
    operation: StaffOperation,
    outcome: StaffAuditRecord["outcome"],
  ): Promise<void> {
    await this.staffAuditRepository.record(
      createStaffAuditRecord({
        actor: staffAuditActor(principal),
        action: operation.action,
        target: operation.target,
        outcome,
        recordedAt: this.now(),
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

function staffAccountTarget(staffAccountId: string): string {
  return `staff-account:${
    staffAccountId.slice(0, STAFF_AUDIT_TARGET_LIMIT) || "unnamed"
  }`;
}

function auditLogPageSize(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit) || limit < 1) {
    return STAFF_AUDIT_LOG_PAGE_SIZE;
  }

  return Math.min(Math.floor(limit), STAFF_AUDIT_LOG_MAX_PAGE_SIZE);
}
