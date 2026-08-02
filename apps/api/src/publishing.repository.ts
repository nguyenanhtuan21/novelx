import type {
  ChapterPublicationSchedule,
  PublishedSnapshot,
} from "@novelx/shared";

export const PUBLISHING_REPOSITORY = Symbol("PUBLISHING_REPOSITORY");

/**
 * What NovelX has made public, and what it intends to.
 *
 * There is deliberately no update or delete of a Published Snapshot: a snapshot
 * is immutable (ADR-0003), so a post-publication fix is a further version and
 * every earlier one stays as the record of what readers saw. Publishing answers
 * whether it wrote, so two operators racing on one Chapter version cannot both
 * believe they published it.
 *
 * Schedules are the other half: an intention about when, replaceable until the
 * Chapter goes out, and holding no content of its own.
 */
export type PublishingRepository = {
  publish(
    snapshot: PublishedSnapshot,
  ): Promise<"published" | "already-published">;
  /** The newest version of every published Chapter, in Chapter order. */
  listPublishedChapters(seriesId: string): Promise<PublishedSnapshot[]>;
  /** The newest version of one published Chapter. */
  findPublishedChapter(input: {
    seriesId: string;
    chapterId: string;
  }): Promise<PublishedSnapshot | undefined>;
  schedule(schedule: ChapterPublicationSchedule): Promise<void>;
  findSchedule(
    chapterId: string,
  ): Promise<ChapterPublicationSchedule | undefined>;
};
