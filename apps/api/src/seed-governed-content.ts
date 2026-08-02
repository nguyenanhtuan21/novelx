import {
  approveChapterDraft,
  authorChapterDraft,
  chapterDraftProvenance,
  createProvenanceEntry,
  createRightsRecord,
  createSeries,
  createStaffPrincipal,
  evaluateQualityGate,
  provenanceSource,
  publishChapter,
  WORLDWIDE_TERRITORY,
  type ChapterDraft,
  type ReportedQualityCheck,
} from "@novelx/shared";

import type { ProvenanceRepository } from "./provenance.repository.js";
import type { PublishingRepository } from "./publishing.repository.js";
import type { RightsRepository } from "./rights.repository.js";
import type { StaffCmsRepository } from "./staff-cms.repository.js";

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
  permissions: [
    "chapter:approve",
    "chapter:publish",
    "rights:write",
    "canon:write",
  ],
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
  ...authorChapterDraft({
    id: "chuong-1",
    series: seedSeries,
    chapterNumber: 1,
    title: "Mùi Mưa Đầu Tiên",
    body: "Mưa rơi trên mái ngõ, và một lời thề cũ được nhắc lại trong đêm.",
  }),
  rightsRecordId: seedRightsRecord.id,
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

// The seed Chapter goes through the same path a real one does: a grant on
// record, lineage in the ledger, a Quality Gate run over all of it, a reviewer
// who approved it, and a publication in sequence. Hand-writing a passing gate
// result or an approval would make the seed demonstrate a route that does not
// exist.
const seedApprovedDraft = approveChapterDraft({
  draft: {
    ...seedDraft,
    qualityGate: evaluateQualityGate({
      draft: seedDraft,
      chapterRightsRecord: seedRightsRecord,
      lineage: seedLineage,
      reportedChecks: seedReportedChecks,
      evaluatedAt: "2026-07-31T00:00:00.000Z",
    }),
  },
  actor: seedEditor,
  approvedAt: "2026-07-31T00:00:00.000Z",
});

const seedSnapshot = publishChapter({
  series: seedSeries,
  draft: seedApprovedDraft,
  actor: seedEditor,
  publishedChapterNumbers: [],
  lineage: seedLineage,
  publishedAt: "2026-07-31T00:00:00.000Z",
});

/**
 * Writes one governed Series into a deployment that has no database, so a local
 * run has something to read without anyone provisioning a Staff Account first.
 *
 * It seeds the stores rather than standing in for them, which is what keeps the
 * catalog honest: the seed Chapter is public because it was published, exactly
 * like one an editor publishes in the same process.
 */
export async function seedGovernedContent(repositories: {
  staffCmsRepository: StaffCmsRepository;
  publishingRepository: PublishingRepository;
  provenanceRepository: ProvenanceRepository;
  rightsRepository: RightsRepository;
}): Promise<void> {
  await repositories.staffCmsRepository.saveSeries(seedSeries);
  await repositories.staffCmsRepository.saveChapterDraft(seedApprovedDraft);
  await repositories.rightsRepository.write(seedRightsRecord);

  for (const entry of seedLineage) {
    await repositories.provenanceRepository.append(entry);
  }

  await repositories.publishingRepository.publish(seedSnapshot);
}
