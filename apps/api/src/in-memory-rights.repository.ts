import type { RightsRecord, WorkflowMaterial } from "@novelx/shared";

import type { RightsRepository } from "./rights.repository.js";

export class InMemoryRightsRepository implements RightsRepository {
  private readonly records = new Map<string, RightsRecord>();

  async save(record: RightsRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async find(rightsRecordId: string): Promise<RightsRecord | undefined> {
    return this.records.get(rightsRecordId);
  }

  async listForMaterial(material: WorkflowMaterial): Promise<RightsRecord[]> {
    return [...this.records.values()]
      .filter(
        (record) =>
          record.material.id === material.id &&
          record.material.kind === material.kind,
      )
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  }
}
