import { Injectable, NotFoundException } from "@nestjs/common";

import type { CatalogRepository } from "./catalog.repository.js";

@Injectable()
export class CatalogService {
  constructor(private readonly catalogRepository: CatalogRepository) {}

  async listSeries() {
    const seriesList = await this.catalogRepository.listSeries();

    return seriesList.map((series) => ({
      id: series.id,
      title: series.title,
      synopsis: series.synopsis,
      status: series.status,
      creativeDisclosure: series.creativeDisclosure,
      taxonomy: series.taxonomy,
    }));
  }

  async getPublicChapter(input: { seriesId: string; chapterId: string }) {
    const snapshot = await this.catalogRepository.getPublicChapter(input);

    if (!snapshot) {
      throw new NotFoundException("Published Snapshot not found");
    }

    return snapshot;
  }
}
