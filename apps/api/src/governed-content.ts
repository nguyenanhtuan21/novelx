import { NotFoundException } from "@nestjs/common";
import type { ChapterDraft, Series } from "@novelx/shared";

import type { StaffCmsRepository } from "./staff-cms.repository.js";

/**
 * Finds the governed Series a staff request named. A Series the CMS does not
 * hold is answered as unknown rather than as an empty one, because every staff
 * surface reaches its content through the Series that holds it.
 */
export async function requireSeries(
  staffCmsRepository: StaffCmsRepository,
  seriesId: string,
): Promise<Series> {
  const series = await staffCmsRepository.findSeries(seriesId);

  if (!series) {
    throw new NotFoundException(`the CMS holds no Series called ${seriesId}`);
  }

  return series;
}

/**
 * Finds a draft Chapter under the Series that holds it.
 *
 * A draft belonging to another Series is answered as unknown rather than
 * returned, so naming a Chapter under the wrong Series is not a way to reach it.
 */
export async function requireChapterDraft(
  staffCmsRepository: StaffCmsRepository,
  input: { seriesId: string; chapterId: string },
): Promise<ChapterDraft> {
  return (await requireSeriesChapter(staffCmsRepository, input)).draft;
}

/**
 * The same lookup, for the operations that act on the Chapter *and* the Series
 * it belongs to — publishing above all, which reads the Series to attach the
 * Chapter to it rather than taking the Series id on the caller's word.
 */
export async function requireSeriesChapter(
  staffCmsRepository: StaffCmsRepository,
  input: { seriesId: string; chapterId: string },
): Promise<{ series: Series; draft: ChapterDraft }> {
  const series = await requireSeries(staffCmsRepository, input.seriesId);
  const draft = await staffCmsRepository.findChapterDraft(input.chapterId);

  if (!draft || draft.seriesId !== series.id) {
    throw new NotFoundException(
      `Series ${series.id} holds no draft Chapter called ${input.chapterId}`,
    );
  }

  return { series, draft };
}
