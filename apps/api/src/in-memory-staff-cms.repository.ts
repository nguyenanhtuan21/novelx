import type { ChapterDraft, Series, StoryBible } from "@novelx/shared";

import type { StaffCmsRepository } from "./staff-cms.repository.js";

export class InMemoryStaffCmsRepository implements StaffCmsRepository {
  private readonly series = new Map<string, Series>();
  private readonly storyBibles = new Map<string, StoryBible>();
  private readonly chapterDrafts = new Map<string, ChapterDraft>();

  async saveSeries(series: Series): Promise<void> {
    this.series.set(series.id, series);
  }

  async findSeries(seriesId: string): Promise<Series | undefined> {
    return this.series.get(seriesId);
  }

  async saveStoryBible(storyBible: StoryBible): Promise<void> {
    this.storyBibles.set(storyBible.seriesId, storyBible);
  }

  async findStoryBible(seriesId: string): Promise<StoryBible | undefined> {
    return this.storyBibles.get(seriesId);
  }

  async saveChapterDraft(draft: ChapterDraft): Promise<void> {
    this.chapterDrafts.set(draft.id, draft);
  }

  async listChapterDrafts(seriesId: string): Promise<ChapterDraft[]> {
    return [...this.chapterDrafts.values()]
      .filter((draft) => draft.seriesId === seriesId)
      .sort((left, right) => left.chapterNumber - right.chapterNumber);
  }
}
