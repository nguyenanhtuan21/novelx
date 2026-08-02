import { Pool } from "pg";
import type {
  ChapterPublicationSchedule,
  ChapterTakedown,
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
  supersedes_snapshot_id: string | null;
  revision_reason: string | null;
};

type ScheduleRow = {
  chapter_id: string;
  series_id: string;
  chapter_number: number;
  scheduled_for: Date;
  scheduled_by_staff_account_id: string;
  scheduled_at: Date;
};

type TakedownRow = {
  chapter_id: string;
  series_id: string;
  snapshot_id: string;
  reason: string;
  taken_down_by_staff_account_id: string;
  taken_down_at: Date;
};

const SNAPSHOT_COLUMNS = `id, chapter_id, series_id, chapter_number, title, body,
                          version, creative_disclosure,
                          provenance_ledger_entry_id, rights_record_ids,
                          published_at, published_by_staff_account_id,
                          supersedes_snapshot_id, revision_reason`;

const TAKEDOWN_COLUMNS = `chapter_id, series_id, snapshot_id, reason,
                          taken_down_by_staff_account_id, taken_down_at`;

/**
 * The Chapters NovelX is still willing to distribute. Written once rather than
 * per query, because a reader-facing read that forgot it would put a Chapter
 * somebody took down back in front of readers.
 */
const NOT_TAKEN_DOWN = `not exists (
           select 1 from chapter_takedowns t where t.chapter_id = ps.chapter_id
         )`;

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
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
        snapshot.revision?.supersedesSnapshotId ?? null,
        snapshot.revision?.reason ?? null,
      ],
    );

    return written.rowCount === 0 ? "already-published" : "published";
  }

  async listChapterVersions(input: {
    seriesId: string;
    chapterId: string;
  }): Promise<PublishedSnapshot[]> {
    const versions = await this.pool.query<PublishedSnapshotRow>(
      `select ${SNAPSHOT_COLUMNS}
         from published_snapshots ps
        where series_id = $1 and chapter_id = $2
        order by version desc`,
      [input.seriesId, input.chapterId],
    );

    return versions.rows.map(toPublishedSnapshot);
  }

  async publishedChapterNumbers(seriesId: string): Promise<number[]> {
    const published = await this.pool.query<{ chapter_number: number }>(
      `select distinct chapter_number
         from published_snapshots ps
        where series_id = $1
        order by chapter_number`,
      [seriesId],
    );

    return published.rows.map((row) => row.chapter_number);
  }

  async listDistributedChapters(
    seriesId: string,
  ): Promise<PublishedSnapshot[]> {
    const distributed = await this.pool.query<PublishedSnapshotRow>(
      `select distinct on (chapter_id) ${SNAPSHOT_COLUMNS}
         from published_snapshots ps
        where series_id = $1 and ${NOT_TAKEN_DOWN}
        order by chapter_id, version desc`,
      [seriesId],
    );

    return distributed.rows
      .map(toPublishedSnapshot)
      .sort((left, right) => left.chapterNumber - right.chapterNumber);
  }

  async findDistributedChapter(input: {
    seriesId: string;
    chapterId: string;
  }): Promise<PublishedSnapshot | undefined> {
    const distributed = await this.pool.query<PublishedSnapshotRow>(
      `select ${SNAPSHOT_COLUMNS}
         from published_snapshots ps
        where series_id = $1 and chapter_id = $2 and ${NOT_TAKEN_DOWN}
        order by version desc
        limit 1`,
      [input.seriesId, input.chapterId],
    );
    const row = distributed.rows[0];

    return row ? toPublishedSnapshot(row) : undefined;
  }

  /**
   * Stops distribution, writing nothing to the snapshots it stops. `do nothing`
   * keeps the Staff Account that first took the decision, so a second takedown
   * does not move the accountability to whoever came last.
   */
  async takeDown(takedown: ChapterTakedown): Promise<void> {
    await this.pool.query(
      `insert into chapter_takedowns (${TAKEDOWN_COLUMNS})
       values ($1, $2, $3, $4, $5, $6)
       on conflict (chapter_id) do nothing`,
      [
        takedown.chapterId,
        takedown.seriesId,
        takedown.snapshotId,
        takedown.reason,
        takedown.takenDownByStaffAccountId,
        takedown.takenDownAt,
      ],
    );
  }

  async findTakedown(chapterId: string): Promise<ChapterTakedown | undefined> {
    const found = await this.pool.query<TakedownRow>(
      `select ${TAKEDOWN_COLUMNS}
         from chapter_takedowns
        where chapter_id = $1`,
      [chapterId],
    );
    const row = found.rows[0];

    return row
      ? Object.freeze({
          seriesId: row.series_id,
          chapterId: row.chapter_id,
          snapshotId: row.snapshot_id,
          reason: row.reason,
          takenDownByStaffAccountId: row.taken_down_by_staff_account_id,
          takenDownAt: row.taken_down_at.toISOString(),
        })
      : undefined;
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
    ...(row.supersedes_snapshot_id && row.revision_reason
      ? {
          revision: Object.freeze({
            supersedesSnapshotId: row.supersedes_snapshot_id,
            reason: row.revision_reason,
          }),
        }
      : {}),
  });
}
