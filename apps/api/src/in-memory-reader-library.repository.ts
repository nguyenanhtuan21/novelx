import {
  createAnonymousReaderSession,
  createReaderAccount,
  followSeries,
  grantEntitlement,
  recordAnonymousProgress,
  recordReaderProgress,
  unfollowSeries,
  type AnonymousReaderSession,
  type Entitlement,
  type ReaderAccount,
  type ReadingProgress,
  type SeriesFollow,
} from "@novelx/shared";

import type { ReaderLibraryRepository } from "./reader-library.repository.js";

export class InMemoryReaderLibraryRepository implements ReaderLibraryRepository {
  private readonly readerAccounts = new Map<string, ReaderAccount>();
  private readonly anonymousSessions = new Map<
    string,
    AnonymousReaderSession
  >();

  async loadReaderAccount(readerAccountId: string): Promise<ReaderAccount> {
    return this.readerAccount(readerAccountId);
  }

  async followSeries(input: {
    readerAccountId: string;
    follow: SeriesFollow;
  }): Promise<void> {
    this.saveReaderAccount(
      followSeries(this.readerAccount(input.readerAccountId), input.follow),
    );
  }

  async unfollowSeries(input: {
    readerAccountId: string;
    seriesId: string;
  }): Promise<void> {
    this.saveReaderAccount(
      unfollowSeries(this.readerAccount(input.readerAccountId), {
        seriesId: input.seriesId,
      }),
    );
  }

  async recordReaderProgress(input: {
    readerAccountId: string;
    progress: ReadingProgress;
  }): Promise<void> {
    this.saveReaderAccount(
      recordReaderProgress(
        this.readerAccount(input.readerAccountId),
        input.progress,
      ),
    );
  }

  async loadEntitlements(
    readerAccountId: string,
  ): Promise<Record<string, Entitlement>> {
    return this.readerAccount(readerAccountId).entitlements;
  }

  async grantEntitlement(input: {
    readerAccountId: string;
    entitlement: Entitlement;
    grantedAt: string;
  }): Promise<void> {
    this.saveReaderAccount(
      grantEntitlement(
        this.readerAccount(input.readerAccountId),
        input.entitlement,
      ),
    );
  }

  async loadAnonymousSession(
    anonymousSessionId: string,
  ): Promise<AnonymousReaderSession> {
    return this.anonymousSession(anonymousSessionId);
  }

  async recordAnonymousProgress(input: {
    anonymousSessionId: string;
    progress: ReadingProgress;
  }): Promise<void> {
    const session = this.anonymousSession(input.anonymousSessionId);

    this.anonymousSessions.set(
      session.id,
      recordAnonymousProgress(session, input.progress),
    );
  }

  async upgradeAnonymousSession(input: {
    anonymousSessionId: string;
    reader: ReaderAccount;
  }): Promise<{ readerAccountId: string }> {
    const session = this.anonymousSession(input.anonymousSessionId);

    if (session.upgradedToReaderAccountId) {
      return { readerAccountId: session.upgradedToReaderAccountId };
    }

    this.saveReaderAccount(input.reader);
    this.anonymousSessions.set(session.id, {
      ...session,
      upgradedToReaderAccountId: input.reader.id,
    });

    return { readerAccountId: input.reader.id };
  }

  private readerAccount(readerAccountId: string): ReaderAccount {
    return (
      this.readerAccounts.get(readerAccountId) ??
      createReaderAccount({ id: readerAccountId })
    );
  }

  private anonymousSession(anonymousSessionId: string): AnonymousReaderSession {
    return (
      this.anonymousSessions.get(anonymousSessionId) ??
      createAnonymousReaderSession({ id: anonymousSessionId })
    );
  }

  private saveReaderAccount(reader: ReaderAccount): void {
    this.readerAccounts.set(reader.id, reader);
  }
}
