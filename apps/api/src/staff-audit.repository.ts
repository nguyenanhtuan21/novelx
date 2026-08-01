import type { StaffAuditRecord } from "@novelx/shared";

export const STAFF_AUDIT_REPOSITORY = Symbol("STAFF_AUDIT_REPOSITORY");

/**
 * The append-only record of privileged staff operations.
 *
 * There is deliberately no update or delete: an audit trail that staff can
 * rewrite is not evidence. `list` returns the most recent records first.
 */
export type StaffAuditRepository = {
  record(record: StaffAuditRecord): Promise<void>;
  list(input: { limit: number }): Promise<StaffAuditRecord[]>;
};
