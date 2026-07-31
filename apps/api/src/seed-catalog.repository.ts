import {
  createChapterDraft,
  createSeries,
  createStaffPrincipal,
  publishChapter,
  type PublicCatalogSeries,
  type PublishedSnapshot,
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

const seedSnapshot = publishChapter({
  series: seedSeries,
  draft: createChapterDraft({
    id: "chuong-1",
    seriesId: seedSeries.id,
    chapterNumber: 1,
    title: "Mùi Mưa Đầu Tiên",
    body: "Mưa rơi trên mái ngõ, và một lời thề cũ được nhắc lại trong đêm.",
    creativeDisclosure: "Hybrid",
    rightsRecordId: "rights-seed-1",
    provenanceLedgerEntryId: "prov-seed-1",
    qualityGate: {
      canonContinuity: "pass",
      policySafety: "pass",
      originalityIp: "pass",
      metadata: "pass",
      rightsRecord: "pass",
      provenanceLedger: "pass",
      humanApproval: "pass",
    },
    humanApproval: {
      reviewerStaffAccountId: "staff-seed-editor",
      approvedAt: "2026-07-31T00:00:00.000Z",
    },
  }),
  actor: createStaffPrincipal({
    staffAccountId: "staff-seed-editor",
    permissions: ["chapter:publish"],
  }),
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
