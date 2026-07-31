import type { PublicCatalogSeries, PublishedSnapshot } from "@novelx/shared";

export const CATALOG_REPOSITORY = Symbol("CATALOG_REPOSITORY");

export type CatalogRepository = {
  listSeries(): Promise<PublicCatalogSeries[]> | PublicCatalogSeries[];
  getPublicChapter(input: {
    seriesId: string;
    chapterId: string;
  }): Promise<PublishedSnapshot | undefined> | PublishedSnapshot | undefined;
};
