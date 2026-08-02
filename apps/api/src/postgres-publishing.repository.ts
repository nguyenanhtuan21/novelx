import { Pool } from "pg";
import type {
  ChapterPublicationSchedule,
  CreativeDisclosure,
  PublishedSnapshot,
} from "@novelx/shared";

import type { PublishingRepository } from "./publishing.repository.js";

type PublishedSnapshotRow = {
  id: string;
  chapter_id: string;
  series_id: string;
  chapter_number: number;
  title: string;
  body: string;
  version: number;
  creative_disclosure: CreativeDisclosure;
  provenance_ledger_entry_id: string;
  rights_record_ids: string[];
  published_at: Date;
  published_by_staff_account_id: string;
};

type ScheduleRow = {
  chapter_id: string;
  series_id: string;
  chapter_number: number;
  scheduled_for: Date;
  scheduled_by_staff_account_id: string;
  scheduled_at: Date;
};

const SNAPSHOT_COLUMNS = `id, chapter_id, series_id, chapter_number, title, body,
                          version, creative_disclosure,
                          provenance_ledger_entry_id, rights_record_ids,
                          published_at, published_by_staff_account_id`;

export class PostgresPublishingRepository implements PublishingRepository {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  /**
   * Writes a version once. `do nothing` rather than `do update` is the
   * immutability rule in the database: a Chapter version that is already public
   * cannot be quietly replaced by a second write of the same version.
   */
  async publish(
    snapshot: PublishedSnapshot,
  ): Promise<"published" | "already-published"> {
    const written = await this.pool.query(
      `insert into published_snapshots (${SNAPSHOT_COLUMNS})
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (chapter_id, version) do nothing`,
      [
        snapshot.id,
        snapshot.chapterId,
        snapshot.seriesId,
        snapshot.chapterNumber,
        snapshot.title,
        snapshot.body,
        snapshot.version,
        snapshot.creativeDisclosure,
        snapshot.provenanceLedgerEntryId,
        JSON.stringify(snapshot.rightsRecordIds),
        snapshot.publishedAt,
        snapshot.publishedByStaffAccountId,
      ],
    );

    return written.rowCount === 0 ? "already-published" : "published";
  }

  async listPublishedChapters(seriesId: string): Promise<PublishedSnapshot[]> {
    const published = await this.pool.query<PublishedSnapshotRow>(
      `select distinct on (chapter_id) ${SNAPSHOT_COLUMNS}
         from published_snapshots
        where series_id = $1 and publicly_readable = true
        order by chapter_id, version desc`,
      [seriesId],
    );

    return published.rows
      .map(toPublishedSnapshot)
      .sort((left, right) => left.chapterNumber - right.chapterNumber);
  }

  async findPublishedChapter(input: {
    seriesId: string;
    chapterId: string;
  }): Promise<PublishedSnapshot | undefined> {
    const published = await this.pool.query<PublishedSnapshotRow>(
      `select ${SNAPSHOT_COLUMNS}
         from published_snapshots
        where series_id = $1 and chapter_id = $2 and publicly_readable = true
        order by version desc
        limit 1`,
      [input.seriesId, input.chapterId],
    );
    const row = published.rows[0];

    return row ? toPublishedSnapshot(row) : undefined;
  }

  async schedule(schedule: ChapterPublicationSchedule): Promise<void> {
    await this.pool.query(
      `insert into chapter_publication_schedules
         (chapter_id, series_id, chapter_number, scheduled_for,
          scheduled_by_staff_account_id, scheduled_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (chapter_id) do update set
         scheduled_for = excluded.scheduled_for,
         scheduled_by_staff_account_id = excluded.scheduled_by_staff_account_id,
         scheduled_at = excluded.scheduled_at`,
      [
        schedule.chapterId,
        schedule.seriesId,
        schedule.chapterNumber,
        schedule.scheduledFor,
        schedule.scheduledByStaffAccountId,
        schedule.scheduledAt,
      ],
    );
  }

  async findSchedule(
    chapterId: string,
  ): Promise<ChapterPublicationSchedule | undefined> {
    const found = await this.pool.query<ScheduleRow>(
      `select chapter_id, series_id, chapter_number, scheduled_for,
              scheduled_by_staff_account_id, scheduled_at
         from chapter_publication_schedules
        where chapter_id = $1`,
      [chapterId],
    );
    const row = found.rows[0];

    return row
      ? Object.freeze({
          chapterId: row.chapter_id,
          seriesId: row.series_id,
          chapterNumber: row.chapter_number,
          scheduledFor: row.scheduled_for.toISOString(),
          scheduledByStaffAccountId: row.scheduled_by_staff_account_id,
          scheduledAt: row.scheduled_at.toISOString(),
        })
      : undefined;
  }
}

function toPublishedSnapshot(row: PublishedSnapshotRow): PublishedSnapshot {
  return Object.freeze({
    id: row.id,
    chapterId: row.chapter_id,
    seriesId: row.series_id,
    chapterNumber: row.chapter_number,
    title: row.title,
    body: row.body,
    version: row.version,
    creativeDisclosure: row.creative_disclosure,
    provenanceLedgerEntryId: row.provenance_ledger_entry_id,
    rightsRecordIds: Object.freeze(row.rights_record_ids),
    publishedAt: row.published_at.toISOString(),
    publishedByStaffAccountId: row.published_by_staff_account_id,
    publiclyReadable: true,
  });
}
