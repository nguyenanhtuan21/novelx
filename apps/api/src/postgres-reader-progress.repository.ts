import { Pool } from "pg";
import type {
  AnonymousReaderSession,
  Entitlement,
  ReaderAccount,
  ReadingProgress,
} from "@novelx/shared";

import type { ReaderProgressRepository } from "./reader-progress.repository.js";

type AnonymousReaderSessionRow = {
  id: string;
  progress: Record<string, ReadingProgress>;
};

type ReaderAccountRow = {
  id: string;
  progress: Record<string, ReadingProgress>;
  entitlements: Record<string, Entitlement>;
};

export class PostgresReaderProgressRepository implements ReaderProgressRepository {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async getAnonymousSession(
    sessionId: string,
  ): Promise<AnonymousReaderSession | undefined> {
    const result = await this.pool.query<AnonymousReaderSessionRow>(
      `select id, progress
         from anonymous_reader_sessions
        where id = $1`,
      [sessionId],
    );

    const row = result.rows[0];
    if (!row) {
      return undefined;
    }

    return { id: row.id, progress: row.progress };
  }

  async saveAnonymousSession(
    session: AnonymousReaderSession,
  ): Promise<AnonymousReaderSession> {
    await this.pool.query(
      `insert into anonymous_reader_sessions (id, progress)
       values ($1, $2::jsonb)
       on conflict (id) do update
         set progress = excluded.progress,
             updated_at = now()`,
      [session.id, JSON.stringify(session.progress)],
    );

    return session;
  }

  async getReaderAccount(
    readerAccountId: string,
  ): Promise<ReaderAccount | undefined> {
    const result = await this.pool.query<ReaderAccountRow>(
      `select id, progress, entitlements
         from reader_accounts
        where id = $1`,
      [readerAccountId],
    );

    const row = result.rows[0];
    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      progress: row.progress,
      entitlements: row.entitlements,
    };
  }

  async saveReaderAccount(reader: ReaderAccount): Promise<ReaderAccount> {
    await this.pool.query(
      `insert into reader_accounts (id, progress, entitlements)
       values ($1, $2::jsonb, $3::jsonb)
       on conflict (id) do update
         set progress = excluded.progress,
             entitlements = excluded.entitlements,
             updated_at = now()`,
      [
        reader.id,
        JSON.stringify(reader.progress),
        JSON.stringify(reader.entitlements),
      ],
    );

    return reader;
  }
}
