import { Pool } from "pg";
import {
  createAnonymousReaderSession,
  createReaderAccount,
  getReadingProgressKey,
  type AnonymousReaderSession,
  type Entitlement,
  type ReaderAccount,
  type ReadingProgress,
  type SeriesFollow,
} from "@novelx/shared";

import type { ReaderLibraryRepository } from "./reader-library.repository.js";

type SeriesFollowRow = {
  series_id: string;
  followed_at: Date;
};

type ReadingProgressRow = {
  series_id: string;
  chapter_id: string;
  scroll_position: number;
  updated_at: Date;
};

type EntitlementRow = {
  content_id: string;
  benefit: Entitlement["benefit"];
};

export class PostgresReaderLibraryRepository implements ReaderLibraryRepository {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async loadReaderAccount(readerAccountId: string): Promise<ReaderAccount> {
    const [follows, progress] = await Promise.all([
      this.pool.query<SeriesFollowRow>(
        `select series_id, followed_at
           from series_follows
          where reader_account_id = $1`,
        [readerAccountId],
      ),
      this.pool.query<ReadingProgressRow>(
        `select series_id, chapter_id, scroll_position, updated_at
           from reader_reading_progress
          where reader_account_id = $1`,
        [readerAccountId],
      ),
    ]);

    return {
      ...createReaderAccount({ id: readerAccountId }),
      follows: Object.fromEntries(
        follows.rows.map((row): [string, SeriesFollow] => [
          row.series_id,
          {
            seriesId: row.series_id,
            followedAt: row.followed_at.toISOString(),
          },
        ]),
      ),
      progress: readingProgressByChapter(progress.rows),
    };
  }

  async followSeries(input: {
    readerAccountId: string;
    follow: SeriesFollow;
  }): Promise<void> {
    await this.ensureReaderAccount(input.readerAccountId);
    await this.pool.query(
      `insert into series_follows (reader_account_id, series_id, followed_at)
       values ($1, $2, $3)
       on conflict (reader_account_id, series_id) do update
         set followed_at = excluded.followed_at`,
      [input.readerAccountId, input.follow.seriesId, input.follow.followedAt],
    );
  }

  async unfollowSeries(input: {
    readerAccountId: string;
    seriesId: string;
  }): Promise<void> {
    await this.pool.query(
      `delete from series_follows
        where reader_account_id = $1 and series_id = $2`,
      [input.readerAccountId, input.seriesId],
    );
  }

  async recordReaderProgress(input: {
    readerAccountId: string;
    progress: ReadingProgress;
  }): Promise<void> {
    await this.ensureReaderAccount(input.readerAccountId);
    await this.pool.query(
      `insert into reader_reading_progress
         (reader_account_id, chapter_id, series_id, scroll_position, updated_at)
       values ($1, $2, $3, $4, $5)
       on conflict (reader_account_id, series_id, chapter_id) do update
         set series_id = excluded.series_id,
             scroll_position = excluded.scroll_position,
             updated_at = excluded.updated_at
       where reader_reading_progress.updated_at <= excluded.updated_at`,
      [
        input.readerAccountId,
        input.progress.chapterId,
        input.progress.seriesId,
        input.progress.position,
        input.progress.updatedAt,
      ],
    );
  }

  async loadEntitlements(
    readerAccountId: string,
  ): Promise<Record<string, Entitlement>> {
    const held = await this.pool.query<EntitlementRow>(
      `select content_id, benefit
         from reader_entitlements
        where reader_account_id = $1`,
      [readerAccountId],
    );

    return Object.fromEntries(
      held.rows.map((row): [string, Entitlement] => [
        row.content_id,
        { contentId: row.content_id, benefit: row.benefit },
      ]),
    );
  }

  async grantEntitlement(input: {
    readerAccountId: string;
    entitlement: Entitlement;
    grantedAt: string;
  }): Promise<void> {
    await this.ensureReaderAccount(input.readerAccountId);
    await this.pool.query(
      `insert into reader_entitlements
         (reader_account_id, content_id, benefit, granted_at)
       values ($1, $2, $3, $4)
       on conflict (reader_account_id, content_id, benefit) do nothing`,
      [
        input.readerAccountId,
        input.entitlement.contentId,
        input.entitlement.benefit,
        input.grantedAt,
      ],
    );
  }

  async loadAnonymousSession(
    anonymousSessionId: string,
  ): Promise<AnonymousReaderSession> {
    const [session, progress] = await Promise.all([
      this.pool.query<{ upgraded_to_reader_account_id: string | null }>(
        `select upgraded_to_reader_account_id
           from anonymous_reader_sessions
          where id = $1`,
        [anonymousSessionId],
      ),
      this.pool.query<ReadingProgressRow>(
        `select series_id, chapter_id, scroll_position, updated_at
           from anonymous_reading_progress
          where anonymous_session_id = $1`,
        [anonymousSessionId],
      ),
    ]);
    const upgradedToReaderAccountId =
      session.rows[0]?.upgraded_to_reader_account_id;

    return {
      ...createAnonymousReaderSession({ id: anonymousSessionId }),
      progress: readingProgressByChapter(progress.rows),
      ...(upgradedToReaderAccountId ? { upgradedToReaderAccountId } : {}),
    };
  }

  async recordAnonymousProgress(input: {
    anonymousSessionId: string;
    progress: ReadingProgress;
  }): Promise<void> {
    await this.ensureAnonymousSession(input.anonymousSessionId);
    await this.pool.query(
      `insert into anonymous_reading_progress
         (anonymous_session_id, chapter_id, series_id, scroll_position, updated_at)
       values ($1, $2, $3, $4, $5)
       on conflict (anonymous_session_id, series_id, chapter_id) do update
         set series_id = excluded.series_id,
             scroll_position = excluded.scroll_position,
             updated_at = excluded.updated_at
       where anonymous_reading_progress.updated_at <= excluded.updated_at`,
      [
        input.anonymousSessionId,
        input.progress.chapterId,
        input.progress.seriesId,
        input.progress.position,
        input.progress.updatedAt,
      ],
    );
  }

  async upgradeAnonymousSession(input: {
    anonymousSessionId: string;
    reader: ReaderAccount;
  }): Promise<{ readerAccountId: string }> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      await client.query(
        `insert into reader_accounts (id) values ($1)
         on conflict (id) do nothing`,
        [input.reader.id],
      );
      await client.query(
        `insert into anonymous_reader_sessions (id, upgraded_to_reader_account_id)
         values ($1, $2)
         on conflict (id) do update
           set upgraded_to_reader_account_id = coalesce(
                 anonymous_reader_sessions.upgraded_to_reader_account_id,
                 excluded.upgraded_to_reader_account_id
               )`,
        [input.anonymousSessionId, input.reader.id],
      );

      const bound = await client.query<{
        upgraded_to_reader_account_id: string;
      }>(
        `select upgraded_to_reader_account_id
           from anonymous_reader_sessions
          where id = $1`,
        [input.anonymousSessionId],
      );
      const readerAccountId =
        bound.rows[0]?.upgraded_to_reader_account_id ?? input.reader.id;

      if (readerAccountId === input.reader.id) {
        for (const progress of Object.values(input.reader.progress)) {
          await client.query(
            `insert into reader_reading_progress
               (reader_account_id, chapter_id, series_id, scroll_position, updated_at)
             values ($1, $2, $3, $4, $5)
             on conflict (reader_account_id, series_id, chapter_id) do nothing`,
            [
              input.reader.id,
              progress.chapterId,
              progress.seriesId,
              progress.position,
              progress.updatedAt,
            ],
          );
        }
      }

      await client.query("commit");

      return { readerAccountId };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureReaderAccount(readerAccountId: string): Promise<void> {
    await this.pool.query(
      `insert into reader_accounts (id) values ($1)
       on conflict (id) do nothing`,
      [readerAccountId],
    );
  }

  private async ensureAnonymousSession(
    anonymousSessionId: string,
  ): Promise<void> {
    await this.pool.query(
      `insert into anonymous_reader_sessions (id) values ($1)
       on conflict (id) do nothing`,
      [anonymousSessionId],
    );
  }
}

function readingProgressByChapter(
  rows: ReadingProgressRow[],
): Record<string, ReadingProgress> {
  return Object.fromEntries(
    rows.map((row): [string, ReadingProgress] => {
      const progress: ReadingProgress = {
        seriesId: row.series_id,
        chapterId: row.chapter_id,
        position: row.scroll_position,
        updatedAt: row.updated_at.toISOString(),
      };

      return [getReadingProgressKey(progress), progress];
    }),
  );
}
