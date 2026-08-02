import type {
  ChapterPublicationSchedule,
  ChapterTakedown,
  PublishedSnapshot,
} from "@novelx/shared";

export const PUBLISHING_REPOSITORY = Symbol("PUBLISHING_REPOSITORY");

/**
 * What NovelX has made public, what it intends to, and what it has stopped
 * distributing.
 *
 * There is deliberately no update or delete of a Published Snapshot: a snapshot
 * is immutable (ADR-0003), so a post-publication fix is a further version and
 * every earlier one stays as the record of what readers saw. Publishing answers
 * whether it wrote, so two operators racing on one Chapter version cannot both
 * believe they published it. A takedown is a record of its own for the same
 * reason: it stops distribution without writing anything to what was published.
 *
 * The record and the distribution are therefore read apart, because they answer
 * different questions. Which Chapter numbers a Series has published is a fact
 * about the Series that a takedown does not undo — otherwise taking Chapter one
 * down would put every Chapter behind it out of sequence. What readers can open
 * is a question about now.
 *
 * Schedules are the other half of the intention side: replaceable until the
 * Chapter goes out, and holding no content of their own.
 */
export type PublishingRepository = {
  publish(
    snapshot: PublishedSnapshot,
  ): Promise<"published" | "already-published">;
  /** Every version of one Chapter, newest first, takedown or not. */
  listChapterVersions(input: {
    seriesId: string;
    chapterId: string;
  }): Promise<PublishedSnapshot[]>;
  /** Every Chapter number this Series has published, takedown or not. */
  publishedChapterNumbers(seriesId: string): Promise<number[]>;
  /** The newest version of every Chapter readers can open, in Chapter order. */
  listDistributedChapters(seriesId: string): Promise<PublishedSnapshot[]>;
  /** The newest version of one Chapter readers can open. */
  findDistributedChapter(input: {
    seriesId: string;
    chapterId: string;
  }): Promise<PublishedSnapshot | undefined>;
  /**
   * Stops distributing a Chapter, writing nothing to its snapshots, and answers
   * with the decision on record.
   *
   * The write happens once. Two moderators acting at the same time both reach
   * here, and the second is told the first's decision rather than replacing it,
   * so a takedown names who took it and not who came last. The outcome says
   * which of the two this call was, so only the write that happened leaves a
   * line of lineage.
   */
  takeDown(takedown: ChapterTakedown): Promise<{
    outcome: "taken-down" | "already-taken-down";
    takedown: ChapterTakedown;
  }>;
  findTakedown(chapterId: string): Promise<ChapterTakedown | undefined>;
  schedule(schedule: ChapterPublicationSchedule): Promise<void>;
  findSchedule(
    chapterId: string,
  ): Promise<ChapterPublicationSchedule | undefined>;
};
