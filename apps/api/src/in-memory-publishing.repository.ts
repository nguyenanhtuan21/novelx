import type {
  ChapterPublicationSchedule,
  PublishedSnapshot,
} from "@novelx/shared";

import type { PublishingRepository } from "./publishing.repository.js";

export class InMemoryPublishingRepository implements PublishingRepository {
  private readonly snapshots = new Map<string, PublishedSnapshot>();
  private readonly schedules = new Map<string, ChapterPublicationSchedule>();

  async publish(
    snapshot: PublishedSnapshot,
  ): Promise<"published" | "already-published"> {
    if (this.snapshots.has(snapshot.id)) {
      return "already-published";
    }

    this.snapshots.set(snapshot.id, snapshot);

    return "published";
  }

  async listPublishedChapters(seriesId: string): Promise<PublishedSnapshot[]> {
    const newest = new Map<string, PublishedSnapshot>();

    for (const snapshot of this.snapshots.values()) {
      if (snapshot.seriesId !== seriesId) {
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

  async findPublishedChapter(input: {
    seriesId: string;
    chapterId: string;
  }): Promise<PublishedSnapshot | undefined> {
    return (await this.listPublishedChapters(input.seriesId)).find(
      (snapshot) => snapshot.chapterId === input.chapterId,
    );
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
