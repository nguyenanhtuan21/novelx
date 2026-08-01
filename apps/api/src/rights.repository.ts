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
  save(record: RightsRecord): Promise<void>;
  find(rightsRecordId: string): Promise<RightsRecord | undefined>;
  listForMaterial(material: WorkflowMaterial): Promise<RightsRecord[]>;
};
