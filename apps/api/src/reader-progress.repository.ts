import type { AnonymousReaderSession, ReaderAccount } from "@novelx/shared";

export const READER_PROGRESS_REPOSITORY = Symbol("READER_PROGRESS_REPOSITORY");

export type ReaderProgressRepository = {
  getAnonymousSession(
    sessionId: string,
  ): Promise<AnonymousReaderSession | undefined>;
  saveAnonymousSession(
    session: AnonymousReaderSession,
  ): Promise<AnonymousReaderSession>;
  getReaderAccount(readerAccountId: string): Promise<ReaderAccount | undefined>;
  saveReaderAccount(reader: ReaderAccount): Promise<ReaderAccount>;
};
