import { Injectable, NotFoundException } from "@nestjs/common";
import {
  publicCatalogSeries,
  publicChapter,
  type PublicCatalogSeries,
  type PublicChapter,
} from "@novelx/shared";

import type { CatalogRepository } from "./catalog.repository.js";

@Injectable()
export class CatalogService {
  constructor(private readonly catalogRepository: CatalogRepository) {}

  async listSeries(): Promise<PublicCatalogSeries[]> {
    const seriesList = await this.catalogRepository.listSeries();

    return seriesList
      .filter((series) => series.firstPublicChapterId)
      .map((series) => publicCatalogSeries(series));
  }

  async getPublicSeries(input: { seriesId: string }) {
    const series = (await this.listSeries()).find(
      (candidate) => candidate.id === input.seriesId,
    );

    if (!series) {
      throw new NotFoundException("Public Series not found");
    }

    return series;
  }

  /**
   * A public Chapter read, which is a reader-facing projection rather than the
   * snapshot itself: how a Chapter was cleared, traced, and published is how
   * NovelX answers for it internally, and this route is unauthenticated.
   */
  async getPublicChapter(input: {
    seriesId: string;
    chapterId: string;
  }): Promise<PublicChapter> {
    const snapshot = await this.catalogRepository.getPublicChapter(input);

    if (!snapshot) {
      throw new NotFoundException("Published Snapshot not found");
    }

    return publicChapter(snapshot);
  }
}
