import {
  chapterDraftProvenance,
  createProvenanceEntry,
  createRightsRecord,
  createStaffPrincipal,
  evaluateQualityGate,
  WORLDWIDE_TERRITORY,
  type ChapterDraft,
  type ProvenanceEntry,
  type QualityGateResult,
  type ReportedQualityCheck,
} from "./index.js";

/**
 * The records a Quality Gate reads, for the tests that need a draft Chapter
 * which has actually been through it.
 *
 * They are shared rather than hand-written per test because only
 * `evaluateQualityGate` produces a result: a test that invented one would be
 * proving something about a gate result nothing ever ran.
 */

/** The grant a draft Chapter names, as the grants on record hold it. */
export const chapterRightsRecord = createRightsRecord({
  id: "rights-1",
  material: { id: "source-outline-1", kind: "source-material" },
  owner: "NovelX Editorial",
  scope: ["publishing"],
  territories: [WORLDWIDE_TERRITORY],
  duration: { from: "2026-01-01T00:00:00.000Z" },
  modificationAllowed: true,
  aiUseAllowed: false,
  evidence: { kind: "work-for-hire", reference: "contract-2026-001" },
  actor: createStaffPrincipal({
    staffAccountId: "staff-editor-1",
    permissions: ["rights:write"],
  }),
  recordedAt: "2026-01-01T00:00:00.000Z",
});

/** Every condition a checker has to answer, all of them answered well. */
export const reportedChecks: readonly ReportedQualityCheck[] = [
  {
    condition: "canonContinuity",
    verdict: "pass",
    score: 96,
    note: "Khớp canon-1: mưa Ngâu chỉ rơi vào tháng bảy.",
  },
  { condition: "policySafety", verdict: "pass", score: 99 },
  { condition: "originalityIp", verdict: "pass", score: 97 },
  { condition: "metadata", verdict: "pass", score: 100 },
];

/** The lineage the Provenance Ledger holds for a draft, newest entry first. */
export function chapterDraftLineage(draft: ChapterDraft): ProvenanceEntry[] {
  return [
    createProvenanceEntry({
      id: `prov-${draft.id}`,
      source: { kind: "staff", staffAccountId: "staff-editor-1" },
      action: "chapter-draft.author",
      subject: chapterDraftProvenance(draft),
      recordedAt: "2026-07-31T00:00:00.000Z",
    }),
  ];
}

/** What the gate concludes about a draft whose every condition is answered. */
export function passedQualityGate(
  draft: ChapterDraft,
  overrides: { reportedChecks?: readonly ReportedQualityCheck[] } = {},
): QualityGateResult {
  return evaluateQualityGate({
    draft,
    chapterRightsRecord,
    lineage: chapterDraftLineage(draft),
    reportedChecks: overrides.reportedChecks ?? reportedChecks,
    evaluatedAt: "2026-08-01T09:00:00.000Z",
  });
}
