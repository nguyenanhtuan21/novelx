import {
  chapterDraftProvenance,
  createChapterDraft,
  createProvenanceEntry,
  createRightsRecord,
  createSeries,
  createStaffPrincipal,
  evaluateQualityGate,
  provenanceSource,
  publishChapter,
  WORLDWIDE_TERRITORY,
  type ChapterDraft,
  type PublicCatalogSeries,
  type PublishedSnapshot,
  type ReportedQualityCheck,
} from "@novelx/shared";

import type { CatalogRepository } from "./catalog.repository.js";

const seedSeries = createSeries({
  id: "thanh-kiem-trong-mua",
  title: "Thanh Kiếm Trong Mưa",
  synopsis:
    "Một series tiên hiệp Việt Nam được biên tập theo catalog tuyển chọn của NovelX.",
  creativeDisclosure: "Hybrid",
  taxonomy: {
    genre: "fantasy",
    subgenre: "kiem-hiep",
    tropes: ["hidden-lineage"],
    moods: ["hopeful"],
    themes: ["loyalty"],
    audience: "young-adult",
    ageRating: "13+",
    contentWarnings: ["violence"],
  },
  status: "active",
});

const seedEditor = createStaffPrincipal({
  staffAccountId: "staff-seed-editor",
  permissions: ["chapter:publish", "rights:write"],
});

const seedRightsRecord = createRightsRecord({
  id: "rights-seed-1",
  material: { id: "outline-thanh-kiem-trong-mua-1", kind: "source-material" },
  owner: "NovelX Editorial",
  scope: ["publishing"],
  territories: [WORLDWIDE_TERRITORY],
  duration: { from: "2026-01-01T00:00:00.000Z" },
  modificationAllowed: true,
  aiUseAllowed: false,
  evidence: { kind: "work-for-hire", reference: "contract-seed-1" },
  actor: seedEditor,
  recordedAt: "2026-01-01T00:00:00.000Z",
});

const seedDraft: ChapterDraft = {
  id: "chuong-1",
  seriesId: seedSeries.id,
  chapterNumber: 1,
  title: "Mùi Mưa Đầu Tiên",
  body: "Mưa rơi trên mái ngõ, và một lời thề cũ được nhắc lại trong đêm.",
  creativeDisclosure: "Hybrid",
  rightsRecordId: seedRightsRecord.id,
  provenanceLedgerEntryId: "prov-seed-1",
  humanApproval: {
    reviewerStaffAccountId: seedEditor.staffAccountId,
    approvedAt: "2026-07-31T00:00:00.000Z",
  },
};

const seedLineage = [
  createProvenanceEntry({
    id: "prov-seed-1",
    source: provenanceSource(seedEditor),
    action: "chapter-draft.author",
    subject: chapterDraftProvenance(seedDraft),
    recordedAt: "2026-07-30T00:00:00.000Z",
  }),
];

const seedReportedChecks: readonly ReportedQualityCheck[] = [
  { condition: "canonContinuity", verdict: "pass", score: 96 },
  { condition: "policySafety", verdict: "pass", score: 99 },
  { condition: "originalityIp", verdict: "pass", score: 97 },
  { condition: "metadata", verdict: "pass", score: 100 },
];

// The seed chapter goes through the same path a real one does: a grant on
// record, lineage in the ledger, a reviewer who approved it, and a Quality Gate
// run over all of it. Hand-writing a passing gate result would make the seed
// demonstrate a route that does not exist.
const seedSnapshot = publishChapter({
  series: seedSeries,
  draft: createChapterDraft({
    ...seedDraft,
    // Restated because createChapterDraft demands one: on a draft it is optional,
    // and workflow entry is where it stops being.
    rightsRecordId: seedRightsRecord.id,
    qualityGate: evaluateQualityGate({
      draft: seedDraft,
      chapterRightsRecord: seedRightsRecord,
      lineage: seedLineage,
      reportedChecks: seedReportedChecks,
      evaluatedAt: "2026-07-31T00:00:00.000Z",
    }),
  }),
  actor: seedEditor,
  publishedAt: "2026-07-31T00:00:00.000Z",
});

export class SeedCatalogRepository implements CatalogRepository {
  private readonly snapshots: PublishedSnapshot[] = [seedSnapshot];
  private readonly series: PublicCatalogSeries[] = [
    { ...seedSeries, firstPublicChapterId: seedSnapshot.chapterId },
  ];

  listSeries(): PublicCatalogSeries[] {
    return this.series;
  }

  getPublicChapter(input: {
    seriesId: string;
    chapterId: string;
  }): PublishedSnapshot | undefined {
    return this.snapshots.find(
      (candidate) =>
        candidate.seriesId === input.seriesId &&
        candidate.chapterId === input.chapterId,
    );
  }
}
