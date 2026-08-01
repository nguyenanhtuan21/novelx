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

export const STAFF_OPERATION_GATE = Symbol("STAFF_OPERATION_GATE");

/** What a staff operation is called, what it acts on, and what it demands. */
export type StaffOperation = {
  action: string;
  target: string;
  /** Omitted for operations any Staff Account may perform on itself. */
  permission?: string;
};

/**
 * The one gate every privileged staff operation passes through.
 *
 * It answers two questions together, because answering either alone is what
 * goes wrong: may this principal do this, and what does the audit trail say
 * happened. A refused attempt is recorded before it is raised, so a reader
 * session or an AI Factory workflow probing the staff boundary leaves evidence
 * rather than silence.
 */
@Injectable()
export class StaffOperationGate {
  private readonly now: () => string;

  constructor(
    private readonly staffAccounts: StaffAccountDirectory,
    private readonly staffAuditRepository: StaffAuditRepository,
    options: { now?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /**
   * Authorizes a staff operation and records that it was allowed before the
   * work runs, so an operation cannot complete without leaving its own trace.
   */
  async run<T>(
    presented: RequestPrincipal,
    operation: StaffOperation,
    work: (principal: StaffPrincipal) => Promise<T>,
  ): Promise<T> {
    const principal = await this.authorize(presented, operation);
    await this.record(principal, operation, "allowed");

    return work(principal);
  }

  /**
   * Lets a staff operation through, or records the refusal before raising it —
   * a refused attempt is exactly the thing an audit trail exists to keep.
   *
   * Permissions come from the directory rather than the token, so an account
   * that has been deprovisioned, or had a permission taken away, loses it on
   * its next request instead of when its session runs out.
   */
  async authorize(
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

      await this.record(presented, operation, "denied");

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

  async record(
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
}
