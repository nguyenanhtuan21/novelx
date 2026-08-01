import type { RightsRecord, WorkflowMaterial } from "@novelx/shared";

import type { RightsRepository } from "./rights.repository.js";

export class InMemoryRightsRepository implements RightsRepository {
  private readonly records = new Map<string, RightsRecord>();

  async write(record: RightsRecord): Promise<"written" | "already-held"> {
    if (this.records.has(record.id)) {
      return "already-held";
    }

    this.records.set(record.id, record);

    return "written";
  }

  async find(rightsRecordId: string): Promise<RightsRecord | undefined> {
    return this.records.get(rightsRecordId);
  }

  async listForMaterial(material: WorkflowMaterial): Promise<RightsRecord[]> {
    // Reversed before sorting so that grants recorded within the same
    // millisecond still come back newest first, as the contract promises.
    return [...this.records.values()]
      .reverse()
      .filter(
        (record) =>
          record.material.id === material.id &&
          record.material.kind === material.kind,
      )
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
  }
}
