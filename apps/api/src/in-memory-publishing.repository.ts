import type {
  ChapterPublicationSchedule,
  ChapterTakedown,
  PublishedSnapshot,
} from "@novelx/shared";

import type { PublishingRepository } from "./publishing.repository.js";

export class InMemoryPublishingRepository implements PublishingRepository {
  private readonly snapshots = new Map<string, PublishedSnapshot>();
  private readonly schedules = new Map<string, ChapterPublicationSchedule>();
  private readonly takedowns = new Map<string, ChapterTakedown>();

  async publish(
    snapshot: PublishedSnapshot,
  ): Promise<"published" | "already-published"> {
    if (this.snapshots.has(snapshot.id)) {
      return "already-published";
    }

    this.snapshots.set(snapshot.id, snapshot);

    return "published";
  }

  async listChapterVersions(input: {
    seriesId: string;
    chapterId: string;
  }): Promise<PublishedSnapshot[]> {
    return [...this.snapshots.values()]
      .filter(
        (snapshot) =>
          snapshot.seriesId === input.seriesId &&
          snapshot.chapterId === input.chapterId,
      )
      .sort((left, right) => right.version - left.version);
  }

  async publishedChapterNumbers(seriesId: string): Promise<number[]> {
    const numbers = new Set(
      [...this.snapshots.values()]
        .filter((snapshot) => snapshot.seriesId === seriesId)
        .map((snapshot) => snapshot.chapterNumber),
    );

    return [...numbers].sort((left, right) => left - right);
  }

  async listDistributedChapters(
    seriesId: string,
  ): Promise<PublishedSnapshot[]> {
    const newest = new Map<string, PublishedSnapshot>();

    for (const snapshot of this.snapshots.values()) {
      if (
        snapshot.seriesId !== seriesId ||
        this.takedowns.has(snapshot.chapterId)
      ) {
        continue;
      }

      const held = newest.get(snapshot.chapterId);

      if (!held || held.version < snapshot.version) {
        newest.set(snapshot.chapterId, snapshot);
      }
    }

    return [...newest.values()].sort(
      (left, right) => left.chapterNumber - right.chapterNumber,
    );
  }

  async findDistributedChapter(input: {
    seriesId: string;
    chapterId: string;
  }): Promise<PublishedSnapshot | undefined> {
    return (await this.listDistributedChapters(input.seriesId)).find(
      (snapshot) => snapshot.chapterId === input.chapterId,
    );
  }

  async takeDown(takedown: ChapterTakedown): Promise<void> {
    this.takedowns.set(takedown.chapterId, takedown);
  }

  async findTakedown(chapterId: string): Promise<ChapterTakedown | undefined> {
    return this.takedowns.get(chapterId);
  }

  async schedule(schedule: ChapterPublicationSchedule): Promise<void> {
    this.schedules.set(schedule.chapterId, schedule);
  }

  async findSchedule(
    chapterId: string,
  ): Promise<ChapterPublicationSchedule | undefined> {
    return this.schedules.get(chapterId);
  }
}
