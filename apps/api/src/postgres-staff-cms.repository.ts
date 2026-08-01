import { Pool } from "pg";
import type {
  CanonEntry,
  ChapterDraft,
  CreativeDisclosure,
  ManagedTaxonomy,
  QualityGateResult,
  Series,
  StoryBible,
  WorkflowMaterialAttachment,
} from "@novelx/shared";

import type { StaffCmsRepository } from "./staff-cms.repository.js";

type SeriesRow = {
  id: string;
  title: string;
  synopsis: string;
  creative_disclosure: CreativeDisclosure;
  taxonomy: ManagedTaxonomy;
  status: Series["status"];
};

type StoryBibleRow = {
  series_id: string;
  canon: CanonEntry[];
  locked_by_staff_account_id: string | null;
  locked_at: Date | null;
};

type ChapterDraftRow = {
  id: string;
  series_id: string;
  chapter_number: number;
  title: string;
  body: string;
  creative_disclosure: CreativeDisclosure;
  workflow_materials: WorkflowMaterialAttachment[] | null;
  rights_record_id: string | null;
  provenance_ledger_entry_id: string | null;
  quality_gate: QualityGateResult | null;
  human_approval: ChapterDraft["humanApproval"] | null;
};

const CHAPTER_DRAFT_COLUMNS = `id, series_id, chapter_number, title, body,
                               creative_disclosure, workflow_materials,
                               rights_record_id, provenance_ledger_entry_id,
                               quality_gate, human_approval`;

export class PostgresStaffCmsRepository implements StaffCmsRepository {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async saveSeries(series: Series): Promise<void> {
    await this.pool.query(
      `insert into series
         (id, title, synopsis, creative_disclosure, taxonomy, status)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do update set
         title = excluded.title,
         synopsis = excluded.synopsis,
         creative_disclosure = excluded.creative_disclosure,
         taxonomy = excluded.taxonomy,
         status = excluded.status,
         updated_at = now()`,
      [
        series.id,
        series.title,
        series.synopsis,
        series.creativeDisclosure,
        JSON.stringify(series.taxonomy),
        series.status,
      ],
    );
  }

  async findSeries(seriesId: string): Promise<Series | undefined> {
    const found = await this.pool.query<SeriesRow>(
      `select id, title, synopsis, creative_disclosure, taxonomy, status
         from series
        where id = $1`,
      [seriesId],
    );
    const row = found.rows[0];

    return row
      ? {
          id: row.id,
          title: row.title,
          synopsis: row.synopsis,
          creativeDisclosure: row.creative_disclosure,
          taxonomy: row.taxonomy,
          status: row.status,
        }
      : undefined;
  }

  async saveStoryBible(storyBible: StoryBible): Promise<void> {
    await this.pool.query(
      `insert into story_bibles
         (series_id, canon, locked_by_staff_account_id, locked_at)
       values ($1, $2, $3, $4)
       on conflict (series_id) do update set
         canon = excluded.canon,
         locked_by_staff_account_id = excluded.locked_by_staff_account_id,
         locked_at = excluded.locked_at,
         updated_at = now()`,
      [
        storyBible.seriesId,
        JSON.stringify(storyBible.canon),
        storyBible.lock?.staffAccountId ?? null,
        storyBible.lock?.lockedAt ?? null,
      ],
    );
  }

  async findStoryBible(seriesId: string): Promise<StoryBible | undefined> {
    const found = await this.pool.query<StoryBibleRow>(
      `select series_id, canon, locked_by_staff_account_id, locked_at
         from story_bibles
        where series_id = $1`,
      [seriesId],
    );
    const row = found.rows[0];

    if (!row) {
      return undefined;
    }

    return {
      seriesId: row.series_id,
      canon: row.canon,
      ...(row.locked_by_staff_account_id && row.locked_at
        ? {
            lock: {
              staffAccountId: row.locked_by_staff_account_id,
              lockedAt: row.locked_at.toISOString(),
            },
          }
        : {}),
    };
  }

  async saveChapterDraft(draft: ChapterDraft): Promise<void> {
    await this.pool.query(
      `insert into chapter_drafts (${CHAPTER_DRAFT_COLUMNS})
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (id) do update set
         chapter_number = excluded.chapter_number,
         title = excluded.title,
         body = excluded.body,
         creative_disclosure = excluded.creative_disclosure,
         workflow_materials = excluded.workflow_materials,
         rights_record_id = excluded.rights_record_id,
         provenance_ledger_entry_id = excluded.provenance_ledger_entry_id,
         quality_gate = excluded.quality_gate,
         human_approval = excluded.human_approval,
         updated_at = now()`,
      [
        draft.id,
        draft.seriesId,
        draft.chapterNumber,
        draft.title,
        draft.body,
        draft.creativeDisclosure,
        draft.workflowMaterials
          ? JSON.stringify(draft.workflowMaterials)
          : null,
        draft.rightsRecordId ?? null,
        draft.provenanceLedgerEntryId ?? null,
        draft.qualityGate ? JSON.stringify(draft.qualityGate) : null,
        draft.humanApproval ? JSON.stringify(draft.humanApproval) : null,
      ],
    );
  }

  async findChapterDraft(chapterId: string): Promise<ChapterDraft | undefined> {
    const found = await this.pool.query<ChapterDraftRow>(
      `select ${CHAPTER_DRAFT_COLUMNS} from chapter_drafts where id = $1`,
      [chapterId],
    );
    const row = found.rows[0];

    return row ? toChapterDraft(row) : undefined;
  }

  async listChapterDrafts(seriesId: string): Promise<ChapterDraft[]> {
    const drafts = await this.pool.query<ChapterDraftRow>(
      `select ${CHAPTER_DRAFT_COLUMNS}
         from chapter_drafts
        where series_id = $1
        order by chapter_number`,
      [seriesId],
    );

    return drafts.rows.map(toChapterDraft);
  }
}

function toChapterDraft(row: ChapterDraftRow): ChapterDraft {
  return {
    id: row.id,
    seriesId: row.series_id,
    chapterNumber: row.chapter_number,
    title: row.title,
    body: row.body,
    creativeDisclosure: row.creative_disclosure,
    ...(row.workflow_materials
      ? { workflowMaterials: row.workflow_materials }
      : {}),
    ...(row.rights_record_id ? { rightsRecordId: row.rights_record_id } : {}),
    ...(row.provenance_ledger_entry_id
      ? { provenanceLedgerEntryId: row.provenance_ledger_entry_id }
      : {}),
    ...(row.quality_gate ? { qualityGate: row.quality_gate } : {}),
    ...(row.human_approval ? { humanApproval: row.human_approval } : {}),
  };
}
