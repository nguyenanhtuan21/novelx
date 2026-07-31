import { Pool } from "pg";
import { createStaffAuditRecord, type StaffAuditRecord } from "@novelx/shared";

import type { StaffAuditRepository } from "./staff-audit.repository.js";

type StaffAuditRow = {
  actor: StaffAuditRecord["actor"];
  action: string;
  target: string;
  outcome: StaffAuditRecord["outcome"];
  recorded_at: Date;
};

export class PostgresStaffAuditRepository implements StaffAuditRepository {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async record(record: StaffAuditRecord): Promise<void> {
    await this.pool.query(
      `insert into staff_audit_records
         (actor, action, target, outcome, recorded_at)
       values ($1, $2, $3, $4, $5)`,
      [
        JSON.stringify(record.actor),
        record.action,
        record.target,
        record.outcome,
        record.recordedAt,
      ],
    );
  }

  async list(input: { limit: number }): Promise<StaffAuditRecord[]> {
    const records = await this.pool.query<StaffAuditRow>(
      `select actor, action, target, outcome, recorded_at
         from staff_audit_records
        order by recorded_at desc, id desc
        limit $1`,
      [input.limit],
    );

    return records.rows.map((row) =>
      createStaffAuditRecord({
        actor: row.actor,
        action: row.action,
        target: row.target,
        outcome: row.outcome,
        recordedAt: row.recorded_at.toISOString(),
      }),
    );
  }
}
