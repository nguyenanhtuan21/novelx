import {
  createChapterDraft,
  createSeries,
  createStaffPrincipal,
  publishChapter,
  type PublishedSnapshot,
  type Series,
} from "@novelx/shared";

import type { CatalogRepository } from "./catalog.repository.js";

const seedSeries = createSeries({
  id: "thanh-kiem-trong-mua",
  title: "Thanh Kiem Trong Mua",
  synopsis: "Mot series tien hiep Viet Nam duoc bien tap theo curated catalog cua NovelX.",
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
    title: "Mui Mua Dau Tien",
    body: "Mua roi tren mai ngo, va mot loi the cu duoc nhac lai trong dem.",
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
  actor: createStaffPrincipal({ staffAccountId: "staff-seed-editor", permissions: ["chapter:publish"] }),
  publishedAt: "2026-07-31T00:00:00.000Z",
});

export class SeedCatalogRepository implements CatalogRepository {
  private readonly series: Series[] = [seedSeries];
  private readonly snapshots: PublishedSnapshot[] = [seedSnapshot];

  listSeries(): Series[] {
    return this.series;
  }

  getPublicChapter(input: { seriesId: string; chapterId: string }): PublishedSnapshot | undefined {
    return this.snapshots.find(
      (candidate) => candidate.seriesId === input.seriesId && candidate.chapterId === input.chapterId,
    );
  }
}
