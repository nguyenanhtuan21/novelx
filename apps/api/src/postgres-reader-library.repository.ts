import { Pool, type PoolClient } from "pg";
import {
  createAnonymousReaderSession,
  createReaderAccount,
  type AnonymousReaderSession,
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

  async saveReaderAccount(reader: ReaderAccount): Promise<void> {
    await this.inTransaction(async (client) => {
      await client.query(
        `insert into reader_accounts (id) values ($1)
         on conflict (id) do nothing`,
        [reader.id],
      );
      await client.query(
        `delete from series_follows where reader_account_id = $1`,
        [reader.id],
      );

      for (const follow of Object.values(reader.follows)) {
        await client.query(
          `insert into series_follows (reader_account_id, series_id, followed_at)
           values ($1, $2, $3)`,
          [reader.id, follow.seriesId, follow.followedAt],
        );
      }

      for (const progress of Object.values(reader.progress)) {
        await client.query(
          `insert into reader_reading_progress
             (reader_account_id, chapter_id, series_id, scroll_position, updated_at)
           values ($1, $2, $3, $4, $5)
           on conflict (reader_account_id, chapter_id) do update
             set series_id = excluded.series_id,
                 scroll_position = excluded.scroll_position,
                 updated_at = excluded.updated_at`,
          [
            reader.id,
            progress.chapterId,
            progress.seriesId,
            progress.position,
            progress.updatedAt,
          ],
        );
      }
    });
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

  async saveAnonymousSession(session: AnonymousReaderSession): Promise<void> {
    await this.inTransaction(async (client) => {
      await client.query(
        `insert into anonymous_reader_sessions (id, upgraded_to_reader_account_id)
         values ($1, $2)
         on conflict (id) do update
           set upgraded_to_reader_account_id = coalesce(
                 anonymous_reader_sessions.upgraded_to_reader_account_id,
                 excluded.upgraded_to_reader_account_id
               )`,
        [session.id, session.upgradedToReaderAccountId ?? null],
      );

      for (const progress of Object.values(session.progress)) {
        await client.query(
          `insert into anonymous_reading_progress
             (anonymous_session_id, chapter_id, series_id, scroll_position, updated_at)
           values ($1, $2, $3, $4, $5)
           on conflict (anonymous_session_id, chapter_id) do update
             set series_id = excluded.series_id,
                 scroll_position = excluded.scroll_position,
                 updated_at = excluded.updated_at`,
          [
            session.id,
            progress.chapterId,
            progress.seriesId,
            progress.position,
            progress.updatedAt,
          ],
        );
      }
    });
  }

  private async inTransaction(
    run: (client: PoolClient) => Promise<void>,
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      await run(client);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

function readingProgressByChapter(
  rows: ReadingProgressRow[],
): Record<string, ReadingProgress> {
  return Object.fromEntries(
    rows.map((row): [string, ReadingProgress] => [
      row.chapter_id,
      {
        seriesId: row.series_id,
        chapterId: row.chapter_id,
        position: row.scroll_position,
        updatedAt: row.updated_at.toISOString(),
      },
    ]),
  );
}
