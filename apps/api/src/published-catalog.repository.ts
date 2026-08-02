import type { PublicCatalogSeries, PublishedSnapshot } from "@novelx/shared";

import type { CatalogRepository } from "./catalog.repository.js";
import type { PublishingRepository } from "./publishing.repository.js";
import type { StaffCmsRepository } from "./staff-cms.repository.js";

/**
 * The public catalog, read as what it is: the governed Series with a Chapter
 * NovelX is currently distributing.
 *
 * Nothing here marks a Series public. A Series becomes readable by having a
 * Chapter readers can open and stops being readable by not having one — whether
 * because nothing was published or because everything published was taken down
 * — so there is no flag to fall out of step with what readers can actually
 * open.
 */
export class PublishedCatalogRepository implements CatalogRepository {
  constructor(
    private readonly staffCmsRepository: StaffCmsRepository,
    private readonly publishingRepository: PublishingRepository,
  ) {}

  async listSeries(): Promise<PublicCatalogSeries[]> {
    const governed = await this.staffCmsRepository.listSeries();
    const catalog = await Promise.all(
      governed.map(async (series) => {
        const [first] = await this.publishingRepository.listDistributedChapters(
          series.id,
        );

        return first
          ? [{ ...series, firstPublicChapterId: first.chapterId }]
          : [];
      }),
    );

    return catalog.flat();
  }

  async getPublicChapter(input: {
    seriesId: string;
    chapterId: string;
  }): Promise<PublishedSnapshot | undefined> {
    return this.publishingRepository.findDistributedChapter(input);
  }
}
