import type { StaffAuditRecord } from "@novelx/shared";

import type { StaffAuditRepository } from "./staff-audit.repository.js";

export class InMemoryStaffAuditRepository implements StaffAuditRepository {
  private readonly records: StaffAuditRecord[] = [];

  async record(record: StaffAuditRecord): Promise<void> {
    this.records.push(record);
  }

  async list(input: { limit: number }): Promise<StaffAuditRecord[]> {
    return this.records.slice(-input.limit).reverse();
  }
}
