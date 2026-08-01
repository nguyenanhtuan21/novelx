import { Pool } from "pg";
import {
  createProvenanceEntry,
  type ProvenanceEntry,
  type ProvenanceSource,
  type ProvenanceTargetKind,
  type ProvenanceVersion,
} from "@novelx/shared";

import type { ProvenanceRepository } from "./provenance.repository.js";

type ProvenanceRow = {
  id: string;
  source: ProvenanceSource;
  action: string;
  target_kind: ProvenanceTargetKind;
  target_id: string;
  series_id: string;
  version: ProvenanceVersion;
  recorded_at: Date;
};

const COLUMNS = `id, source, action, target_kind, target_id, series_id, version, recorded_at`;

/** Most recent first, and stable for entries sharing a timestamp. */
const NEWEST_FIRST = `order by recorded_at desc, recorded_seq desc`;

export class PostgresProvenanceRepository implements ProvenanceRepository {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async append(entry: ProvenanceEntry): Promise<void> {
    await this.pool.query(
      `insert into provenance_ledger_entries (${COLUMNS})
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.id,
        JSON.stringify(entry.source),
        entry.action,
        entry.target.kind,
        entry.target.id,
        entry.target.seriesId,
        JSON.stringify(entry.version),
        entry.recordedAt,
      ],
    );
  }

  async listForSeries(input: {
    seriesId: string;
    limit: number;
  }): Promise<ProvenanceEntry[]> {
    const found = await this.pool.query<ProvenanceRow>(
      `select ${COLUMNS}
         from provenance_ledger_entries
        where series_id = $1
        ${NEWEST_FIRST}
        limit $2`,
      [input.seriesId, input.limit],
    );

    return found.rows.map(toProvenanceEntry);
  }

  async listForTarget(input: {
    seriesId: string;
    kind: ProvenanceTargetKind;
    id: string;
    limit: number;
  }): Promise<ProvenanceEntry[]> {
    const found = await this.pool.query<ProvenanceRow>(
      `select ${COLUMNS}
         from provenance_ledger_entries
        where series_id = $1 and target_kind = $2 and target_id = $3
        ${NEWEST_FIRST}
        limit $4`,
      [input.seriesId, input.kind, input.id, input.limit],
    );

    return found.rows.map(toProvenanceEntry);
  }
}

function toProvenanceEntry(row: ProvenanceRow): ProvenanceEntry {
  return createProvenanceEntry({
    id: row.id,
    source: row.source,
    action: row.action,
    subject: {
      target: {
        kind: row.target_kind,
        id: row.target_id,
        seriesId: row.series_id,
      },
      version: row.version,
    },
    recordedAt: row.recorded_at.toISOString(),
  });
}
