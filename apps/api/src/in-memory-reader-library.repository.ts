import {
  createAnonymousReaderSession,
  createReaderAccount,
  type AnonymousReaderSession,
  type ReaderAccount,
} from "@novelx/shared";

import type { ReaderLibraryRepository } from "./reader-library.repository.js";

export class InMemoryReaderLibraryRepository implements ReaderLibraryRepository {
  private readonly readerAccounts = new Map<string, ReaderAccount>();
  private readonly anonymousSessions = new Map<
    string,
    AnonymousReaderSession
  >();

  async loadReaderAccount(readerAccountId: string): Promise<ReaderAccount> {
    return (
      this.readerAccounts.get(readerAccountId) ??
      createReaderAccount({ id: readerAccountId })
    );
  }

  async saveReaderAccount(reader: ReaderAccount): Promise<void> {
    this.readerAccounts.set(reader.id, reader);
  }

  async loadAnonymousSession(
    anonymousSessionId: string,
  ): Promise<AnonymousReaderSession> {
    return (
      this.anonymousSessions.get(anonymousSessionId) ??
      createAnonymousReaderSession({ id: anonymousSessionId })
    );
  }

  async saveAnonymousSession(session: AnonymousReaderSession): Promise<void> {
    this.anonymousSessions.set(session.id, session);
  }
}
