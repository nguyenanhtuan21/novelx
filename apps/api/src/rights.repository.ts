import type { RightsRecord, WorkflowMaterial } from "@novelx/shared";

export const RIGHTS_REPOSITORY = Symbol("RIGHTS_REPOSITORY");

/**
 * The Rights Records Core Platform holds, looked up two ways: by the record an
 * editor named, and by the material a workflow is reaching for.
 *
 * The material lookup is the one the gate needs. Material may be covered by
 * more than one grant — a licence for publishing and a separate one for AI use
 * is the ordinary case — so it lists them rather than picking, and which grant
 * clears a use is decided by the rights rules, not by the query.
 */
export type RightsRepository = {
  /**
   * Writes a Rights Record that is not already held, answering whether it was
   * written. A record is what later uses are trusted to, so it is never
   * overwritten: a grant that has genuinely changed is a new record, and the
   * old one stays as evidence of what was relied on at the time. Answering
   * rather than checking first is what makes that true under concurrency.
   */
  write(record: RightsRecord): Promise<"written" | "already-held">;
  find(rightsRecordId: string): Promise<RightsRecord | undefined>;
  /** Every grant covering the material, most recently recorded first. */
  listForMaterial(material: WorkflowMaterial): Promise<RightsRecord[]>;
};
