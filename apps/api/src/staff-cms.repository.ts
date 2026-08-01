import type { ChapterDraft, Series, StoryBible } from "@novelx/shared";

export const STAFF_CMS_REPOSITORY = Symbol("STAFF_CMS_REPOSITORY");

/**
 * The governed content the staff CMS owns: Series, their Story Bibles, and the
 * draft Chapters being written against them.
 *
 * There is deliberately no public read here. Readers reach Published Snapshots
 * through the catalog, so a draft has no route to a reader by construction
 * rather than by a flag someone has to remember to check.
 */
export type StaffCmsRepository = {
  saveSeries(series: Series): Promise<void>;
  findSeries(seriesId: string): Promise<Series | undefined>;
  saveStoryBible(storyBible: StoryBible): Promise<void>;
  findStoryBible(seriesId: string): Promise<StoryBible | undefined>;
  saveChapterDraft(draft: ChapterDraft): Promise<void>;
  findChapterDraft(chapterId: string): Promise<ChapterDraft | undefined>;
  listChapterDrafts(seriesId: string): Promise<ChapterDraft[]>;
};
