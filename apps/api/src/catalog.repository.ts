import type { PublishedSnapshot, Series } from "@novelx/shared";

export const CATALOG_REPOSITORY = Symbol("CATALOG_REPOSITORY");

export type CatalogRepository = {
  listSeries(): Promise<Series[]> | Series[];
  getPublicChapter(input: { seriesId: string; chapterId: string }): Promise<PublishedSnapshot | undefined> | PublishedSnapshot | undefined;
};
