import type { AnonymousReaderSession, ReaderAccount } from "@novelx/shared";

export const READER_LIBRARY_REPOSITORY = Symbol("READER_LIBRARY_REPOSITORY");

/**
 * Reader-side state for the library: Series follows and Reading Progress.
 * `load*` returns an empty record when the session or account has no state
 * yet, so callers never branch on first-write.
 */
export type ReaderLibraryRepository = {
  loadReaderAccount(readerAccountId: string): Promise<ReaderAccount>;
  saveReaderAccount(reader: ReaderAccount): Promise<void>;
  loadAnonymousSession(
    anonymousSessionId: string,
  ): Promise<AnonymousReaderSession>;
  saveAnonymousSession(session: AnonymousReaderSession): Promise<void>;
};
