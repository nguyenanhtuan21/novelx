import type { AnonymousReaderSession, ReaderAccount } from "@novelx/shared";

import type { ReaderProgressRepository } from "./reader-progress.repository.js";

export class SeedReaderProgressRepository implements ReaderProgressRepository {
  private readonly anonymousSessions = new Map<
    string,
    AnonymousReaderSession
  >();
  private readonly readerAccounts = new Map<string, ReaderAccount>();

  async getAnonymousSession(
    sessionId: string,
  ): Promise<AnonymousReaderSession | undefined> {
    return this.anonymousSessions.get(sessionId);
  }

  async saveAnonymousSession(
    session: AnonymousReaderSession,
  ): Promise<AnonymousReaderSession> {
    this.anonymousSessions.set(session.id, session);
    return session;
  }

  async getReaderAccount(
    readerAccountId: string,
  ): Promise<ReaderAccount | undefined> {
    return this.readerAccounts.get(readerAccountId);
  }

  async saveReaderAccount(reader: ReaderAccount): Promise<ReaderAccount> {
    this.readerAccounts.set(reader.id, reader);
    return reader;
  }
}
