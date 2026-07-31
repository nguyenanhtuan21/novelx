import { Pool } from "pg";
import type {
  CreativeDisclosure,
  ManagedTaxonomy,
  PublicCatalogSeries,
  PublishedSnapshot,
} from "@novelx/shared";

import type { CatalogRepository } from "./catalog.repository.js";

type SeriesRow = {
  id: string;
  title: string;
  synopsis: string;
  creative_disclosure: CreativeDisclosure;
  taxonomy: ManagedTaxonomy;
  status: PublicCatalogSeries["status"];
  first_public_chapter_id: string | null;
};

type PublishedSnapshotRow = {
  id: string;
  chapter_id: string;
  series_id: string;
  chapter_number: number;
  title: string;
  body: string;
  version: number;
  creative_disclosure: CreativeDisclosure;
  provenance_ledger_entry_id: string;
  rights_record_id: string;
  published_at: Date;
  published_by_staff_account_id: string;
};

export class PostgresCatalogRepository implements CatalogRepository {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
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
    const result = await this.pool.query<PublishedSnapshotRow>(
      `select id,
              chapter_id,
              series_id,
              chapter_number,
              title,
              body,
              version,
              creative_disclosure,
              provenance_ledger_entry_id,
              rights_record_id,
              published_at,
              published_by_staff_account_id
         from published_snapshots
        where series_id = $1 and chapter_id = $2 and publicly_readable = true
        order by version desc
        limit 1`,
      [input.seriesId, input.chapterId],
    );

    const row = result.rows[0];
    if (!row) {
      return undefined;
    }

    return Object.freeze({
      id: row.id,
      chapterId: row.chapter_id,
      seriesId: row.series_id,
      chapterNumber: row.chapter_number,
      title: row.title,
      body: row.body,
      version: row.version,
      creativeDisclosure: row.creative_disclosure,
      provenanceLedgerEntryId: row.provenance_ledger_entry_id,
      rightsRecordId: row.rights_record_id,
      publishedAt: row.published_at.toISOString(),
      publishedByStaffAccountId: row.published_by_staff_account_id,
      publiclyReadable: true,
    });
  }
}
