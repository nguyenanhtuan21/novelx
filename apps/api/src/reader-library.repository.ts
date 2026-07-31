import type {
  AnonymousReaderSession,
  ReaderAccount,
  ReadingProgress,
  SeriesFollow,
} from "@novelx/shared";

export const READER_LIBRARY_REPOSITORY = Symbol("READER_LIBRARY_REPOSITORY");

/**
 * Reader-side state for the library: Series follows and Reading Progress.
 *
 * Writes are single commands rather than whole-account saves, so two readers'
 * tabs — or two API instances — cannot overwrite each other's follows through
 * a read-modify-write window.
 *
 * `load*` returns empty state when the account or session has written nothing
 * yet, so callers never branch on first-write.
 */
export type ReaderLibraryRepository = {
  loadReaderAccount(readerAccountId: string): Promise<ReaderAccount>;
  followSeries(input: {
    readerAccountId: string;
    follow: SeriesFollow;
  }): Promise<void>;
  unfollowSeries(input: {
    readerAccountId: string;
    seriesId: string;
  }): Promise<void>;
  recordReaderProgress(input: {
    readerAccountId: string;
    progress: ReadingProgress;
  }): Promise<void>;

  loadAnonymousSession(
    anonymousSessionId: string,
  ): Promise<AnonymousReaderSession>;
  recordAnonymousProgress(input: {
    anonymousSessionId: string;
    progress: ReadingProgress;
  }): Promise<void>;
  /**
   * Binds the session to a Reader Account exactly once and returns the account
   * the session is bound to — which is the existing one when another request
   * upgraded the same session first.
   */
  upgradeAnonymousSession(input: {
    anonymousSessionId: string;
    reader: ReaderAccount;
  }): Promise<{ readerAccountId: string }>;
};
