import { Pool } from "pg";
import type {
  RightsEvidence,
  RightsRecord,
  RightsUse,
  WorkflowMaterial,
} from "@novelx/shared";

import type { RightsRepository } from "./rights.repository.js";

type RightsRecordRow = {
  id: string;
  material_kind: WorkflowMaterial["kind"];
  material_id: string;
  rights_owner: string;
  scope: RightsUse[];
  territories: string[];
  granted_from: Date;
  granted_until: Date | null;
  modification_allowed: boolean;
  ai_use_allowed: boolean;
  evidence: RightsEvidence;
  recorded_by_staff_account_id: string;
  recorded_at: Date;
};

const COLUMNS = `id, material_kind, material_id, rights_owner, scope, territories,
                 granted_from, granted_until, modification_allowed, ai_use_allowed,
                 evidence, recorded_by_staff_account_id, recorded_at`;

export class PostgresRightsRepository implements RightsRepository {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async write(record: RightsRecord): Promise<"written" | "already-held"> {
    // `do nothing` rather than `do update`: the grant a past workflow relied on
    // is evidence, and an upsert would quietly destroy it.
    const written = await this.pool.query(
      `insert into rights_records (${COLUMNS})
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (id) do nothing`,
      [
        record.id,
        record.material.kind,
        record.material.id,
        record.owner,
        JSON.stringify(record.scope),
        JSON.stringify(record.territories),
        record.duration.from,
        record.duration.until ?? null,
        record.modificationAllowed,
        record.aiUseAllowed,
        JSON.stringify(record.evidence),
        record.recordedByStaffAccountId,
        record.recordedAt,
      ],
    );

    return written.rowCount === 1 ? "written" : "already-held";
  }

  async find(rightsRecordId: string): Promise<RightsRecord | undefined> {
    const found = await this.pool.query<RightsRecordRow>(
      `select ${COLUMNS} from rights_records where id = $1`,
      [rightsRecordId],
    );
    const row = found.rows[0];

    return row ? toRightsRecord(row) : undefined;
  }

  async listForMaterial(material: WorkflowMaterial): Promise<RightsRecord[]> {
    const found = await this.pool.query<RightsRecordRow>(
      `select ${COLUMNS}
         from rights_records
        where material_kind = $1 and material_id = $2
        order by recorded_at desc, recorded_seq desc`,
      [material.kind, material.id],
    );

    return found.rows.map(toRightsRecord);
  }
}

function toRightsRecord(row: RightsRecordRow): RightsRecord {
  return {
    id: row.id,
    material: { id: row.material_id, kind: row.material_kind },
    owner: row.rights_owner,
    scope: row.scope,
    territories: row.territories,
    duration: {
      from: row.granted_from.toISOString(),
      ...(row.granted_until ? { until: row.granted_until.toISOString() } : {}),
    },
    modificationAllowed: row.modification_allowed,
    aiUseAllowed: row.ai_use_allowed,
    evidence: row.evidence,
    recordedByStaffAccountId: row.recorded_by_staff_account_id,
    recordedAt: row.recorded_at.toISOString(),
  };
}
