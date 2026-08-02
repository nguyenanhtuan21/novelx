import { Pool } from "pg";
import type {
  CreativeDisclosure,
  ManagedTaxonomy,
  PublicCatalogSeries,
  PublishedSnapshot,
} from "@novelx/shared";

import type { CatalogRepository } from "./catalog.repository.js";
import { PostgresPublishingRepository } from "./postgres-publishing.repository.js";

type SeriesRow = {
  id: string;
  title: string;
  synopsis: string;
  creative_disclosure: CreativeDisclosure;
  taxonomy: ManagedTaxonomy;
  status: PublicCatalogSeries["status"];
  first_public_chapter_id: string | null;
};

/**
 * The public catalog, read as one join rather than as a Series list and a
 * published lookup per Series.
 *
 * A Chapter read is the same question the publishing side already answers —
 * the newest public version of this Chapter — so it is asked there rather than
 * written out a second time: two copies of that query are two chances for one
 * of them to forget `publicly_readable`.
 */
export class PostgresCatalogRepository implements CatalogRepository {
  private readonly pool: Pool;
  private readonly published: PostgresPublishingRepository;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.published = new PostgresPublishingRepository(connectionString);
  }

  async listSeries(): Promise<PublicCatalogSeries[]> {
    const result = await this.pool.query<SeriesRow>(
      `select s.id,
              s.title,
              s.synopsis,
              s.creative_disclosure,
              s.taxonomy,
              s.status,
              first_public_chapter.chapter_id as first_public_chapter_id
         from series s
         join lateral (
           select chapter_id
             from published_snapshots
            where series_id = s.id and publicly_readable = true
            order by chapter_number asc, version desc
            limit 1
         ) first_public_chapter on true
        where s.takedown_state = 'available'
        order by s.title`,
    );

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      synopsis: row.synopsis,
      creativeDisclosure: row.creative_disclosure,
      taxonomy: row.taxonomy,
      status: row.status,
      firstPublicChapterId: row.first_public_chapter_id ?? undefined,
    }));
  }

  async getPublicChapter(input: {
    seriesId: string;
    chapterId: string;
  }): Promise<PublishedSnapshot | undefined> {
    return this.published.findPublishedChapter(input);
  }
}
