import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createRightsRecord,
  createStaffPrincipal,
  evaluateQualityGate,
  WORLDWIDE_TERRITORY,
  type ChapterDraft,
  type QualityGateConditionName,
  type QualityGateFinding,
  type ReportedQualityCheck,
} from "./index.js";
import {
  chapterDraftLineage,
  chapterRightsRecord,
  reportedChecks,
} from "./quality-gate.fixture.js";

const evaluatedAt = "2026-08-01T09:00:00.000Z";

describe("Quality Gate evaluation", () => {
  it("passes a draft Chapter whose checks were reported and whose records are held", () => {
    const draft = approvedDraft();

    const result = evaluateQualityGate({
      draft,
      chapterRightsRecord,
      lineage: chapterDraftLineage(draft),
      reportedChecks,
      evaluatedAt,
    });

    assert.deepEqual(result.blockingFailures, []);
    assert.equal(result.publicPublishingReady, true);
    assert.equal(result.chapterId, "chuong-1");
    assert.equal(result.evaluatedAt, evaluatedAt);
    assert.deepEqual(
      result.findings.map((entry) => entry.condition),
      [
        "canonContinuity",
        "policySafety",
        "originalityIp",
        "metadata",
        "rightsRecord",
        "provenanceLedger",
        "humanApproval",
      ],
    );
  });

  /**
   * The failure this gate exists to rule out is not a check that failed, it is
   * a check nobody made: a gate that passed on silence could be passed by
   * reporting nothing at all.
   */
  it("blocks a condition nobody reported a check for", () => {
    const draft = approvedDraft();

    const result = evaluateQualityGate({
      draft,
      chapterRightsRecord,
      lineage: chapterDraftLineage(draft),
      reportedChecks: reportedChecks.filter(
        (check) => check.condition !== "policySafety",
      ),
      evaluatedAt,
    });

    assert.deepEqual(result.blockingFailures, ["policySafety"]);
    assert.equal(result.publicPublishingReady, false);
    assert.match(
      finding(result.findings, "policySafety").note ?? "",
      /no check was reported/,
    );
  });

  it("blocks a draft Chapter no Rights Record covers", () => {
    const draft = approvedDraft();
    delete draft.rightsRecordId;

    const result = evaluateQualityGate({
      draft,
      lineage: chapterDraftLineage(draft),
      reportedChecks,
      evaluatedAt,
    });

    assert.deepEqual(result.blockingFailures, ["rightsRecord"]);
    assert.equal(result.publicPublishingReady, false);
  });

  /**
   * A Rights Record id on a draft is an assertion until somebody resolves it.
   * The gate is where that happens, so an id nobody holds blocks rather than
   * standing in for the grant it names.
   */
  it("blocks a draft Chapter naming a Rights Record nobody holds", () => {
    const draft = approvedDraft();

    const result = evaluateQualityGate({
      draft,
      lineage: chapterDraftLineage(draft),
      reportedChecks,
      evaluatedAt,
    });

    assert.deepEqual(result.blockingFailures, ["rightsRecord"]);
    assert.match(
      finding(result.findings, "rightsRecord").note ?? "",
      /rights-1, which is not held/,
    );
  });

  it("blocks a grant that does not cover publishing use", () => {
    const draft = approvedDraft();

    const result = evaluateQualityGate({
      draft,
      chapterRightsRecord: createRightsRecord({
        id: "rights-1",
        material: { id: "source-outline-1", kind: "source-material" },
        owner: "NovelX Editorial",
        scope: ["ai-workflow"],
        territories: [WORLDWIDE_TERRITORY],
        duration: { from: "2026-01-01T00:00:00.000Z" },
        modificationAllowed: true,
        aiUseAllowed: true,
        evidence: { kind: "signed-licence", reference: "contract-2026-014" },
        actor: createStaffPrincipal({
          staffAccountId: "staff-editor-1",
          permissions: ["rights:write"],
        }),
        recordedAt: "2026-01-01T00:00:00.000Z",
      }),
      lineage: chapterDraftLineage(draft),
      reportedChecks,
      evaluatedAt,
    });

    assert.deepEqual(result.blockingFailures, ["rightsRecord"]);
    assert.match(
      finding(result.findings, "rightsRecord").note ?? "",
      /does not cover publishing use/,
    );
  });

  it("reads the rights of a draft Chapter from the material its workflow carries", () => {
    const draft = approvedDraft();
    delete draft.rightsRecordId;
    draft.workflowMaterials = [
      {
        material: { id: "asset-cover-illustration-1", kind: "asset" },
        use: "publishing",
        rightsRecordId: "rights-2",
        territory: "VN",
        modifies: false,
        clearedAt: "2026-07-31T00:00:00.000Z",
      },
    ];

    const result = evaluateQualityGate({
      draft,
      lineage: chapterDraftLineage(draft),
      reportedChecks,
      evaluatedAt,
    });

    assert.deepEqual(result.blockingFailures, []);
    assert.match(
      finding(result.findings, "rightsRecord").note ?? "",
      /rights-2/,
    );
  });

  /**
   * Material licensed for model use says nothing about publishing it, which is
   * the ordinary case a licence splits (ADR-0015). An attachment cleared for one
   * use must not answer the gate for the other.
   */
  it("blocks material cleared only for AI-workflow use", () => {
    const draft = approvedDraft();
    delete draft.rightsRecordId;
    draft.workflowMaterials = [
      {
        material: { id: "dataset-training-1", kind: "dataset" },
        use: "ai-workflow",
        rightsRecordId: "rights-3",
        territory: "VN",
        modifies: false,
        clearedAt: "2026-07-31T00:00:00.000Z",
      },
    ];

    const result = evaluateQualityGate({
      draft,
      lineage: chapterDraftLineage(draft),
      reportedChecks,
      evaluatedAt,
    });

    assert.deepEqual(result.blockingFailures, ["rightsRecord"]);
    assert.match(
      finding(result.findings, "rightsRecord").note ?? "",
      /no Rights Record clears this draft Chapter for publishing/,
    );
  });

  it("blocks a draft Chapter the Provenance Ledger holds no lineage for", () => {
    const draft = approvedDraft();

    const result = evaluateQualityGate({
      draft,
      chapterRightsRecord,
      lineage: [],
      reportedChecks,
      evaluatedAt,
    });

    assert.deepEqual(result.blockingFailures, ["provenanceLedger"]);
    assert.equal(result.publicPublishingReady, false);
  });

  /**
   * Lineage that traces something else is worse than none: it would answer the
   * provenance condition with another Chapter's history.
   */
  it("blocks lineage that traces another artifact", () => {
    const draft = approvedDraft();
    const otherDraft = { ...approvedDraft(), id: "chuong-2", chapterNumber: 2 };

    const result = evaluateQualityGate({
      draft,
      chapterRightsRecord,
      lineage: chapterDraftLineage(otherDraft),
      reportedChecks,
      evaluatedAt,
    });

    assert.deepEqual(result.blockingFailures, ["provenanceLedger"]);
  });

  it("blocks public publishing readiness until a reviewer has approved", () => {
    const draft = approvedDraft();
    delete draft.humanApproval;

    const result = evaluateQualityGate({
      draft,
      chapterRightsRecord,
      lineage: chapterDraftLineage(draft),
      reportedChecks,
      evaluatedAt,
    });

    assert.deepEqual(result.blockingFailures, ["humanApproval"]);
    assert.equal(result.publicPublishingReady, false);
  });

  /**
   * The whole point of a multi-condition gate: a condition that fails is not
   * outvoted by the others scoring well, however the scores are summed up.
   */
  it("keeps a blocking failure that a high aggregate score cannot override", () => {
    const draft = approvedDraft();

    const result = evaluateQualityGate({
      draft,
      chapterRightsRecord,
      lineage: chapterDraftLineage(draft),
      reportedChecks: reportedChecks.map((check) =>
        check.condition === "policySafety"
          ? { ...check, verdict: "blocking-failure" as const, score: 100 }
          : { ...check, score: 100 },
      ),
      evaluatedAt,
    });

    assert.equal(result.meanReportedScore, 100);
    assert.deepEqual(result.blockingFailures, ["policySafety"]);
    assert.equal(result.publicPublishingReady, false);
  });

  it("distinguishes a non-blocking warning from a blocking failure", () => {
    const draft = approvedDraft();

    const result = evaluateQualityGate({
      draft,
      chapterRightsRecord,
      lineage: chapterDraftLineage(draft),
      reportedChecks: reportedChecks.map((check) =>
        check.condition === "metadata"
          ? { ...check, verdict: "warning" as const, note: "Thiếu trope phụ." }
          : check,
      ),
      evaluatedAt,
    });

    assert.deepEqual(result.blockingFailures, []);
    assert.equal(result.publicPublishingReady, true);
    assert.equal(finding(result.findings, "metadata").verdict, "warning");
    assert.equal(finding(result.findings, "metadata").note, "Thiếu trope phụ.");
  });

  it("names every condition that blocks, not just the first one", () => {
    const draft = approvedDraft();
    delete draft.rightsRecordId;
    delete draft.humanApproval;

    const result = evaluateQualityGate({
      draft,
      lineage: [],
      reportedChecks: [],
      evaluatedAt,
    });

    assert.deepEqual(result.blockingFailures, [
      "canonContinuity",
      "policySafety",
      "originalityIp",
      "metadata",
      "rightsRecord",
      "provenanceLedger",
      "humanApproval",
    ]);
    assert.equal(result.meanReportedScore, undefined);
  });
});

describe("what a reported check may speak for", () => {
  /**
   * Rights, lineage, and approval are facts on record. A report claiming one of
   * them would be the gate believing its caller about the very things it exists
   * to check against the record.
   */
  it("refuses a report that speaks for a condition the record answers", () => {
    const draft = approvedDraft();
    delete draft.rightsRecordId;

    assert.throws(
      () =>
        evaluateQualityGate({
          draft,
          lineage: chapterDraftLineage(draft),
          reportedChecks: [
            ...reportedChecks,
            {
              condition: "rightsRecord" as ReportedQualityCheck["condition"],
              verdict: "pass",
            },
          ],
          evaluatedAt,
        }),
      /rightsRecord is answered by the record/,
    );
  });

  it("refuses two verdicts for one condition", () => {
    const draft = approvedDraft();

    assert.throws(
      () =>
        evaluateQualityGate({
          draft,
          chapterRightsRecord,
          lineage: chapterDraftLineage(draft),
          reportedChecks: [
            ...reportedChecks,
            { condition: "policySafety", verdict: "blocking-failure" },
          ],
          evaluatedAt,
        }),
      /policySafety was checked twice/,
    );
  });

  it("refuses a condition the Quality Gate does not have", () => {
    const draft = approvedDraft();

    assert.throws(
      () =>
        evaluateQualityGate({
          draft,
          chapterRightsRecord,
          lineage: chapterDraftLineage(draft),
          reportedChecks: [
            {
              condition: "vibes" as ReportedQualityCheck["condition"],
              verdict: "pass",
            },
          ],
          evaluatedAt,
        }),
      /the Quality Gate has no vibes condition/,
    );
  });

  it("refuses a verdict that is not one the gate reads", () => {
    const draft = approvedDraft();

    assert.throws(
      () =>
        evaluateQualityGate({
          draft,
          chapterRightsRecord,
          lineage: chapterDraftLineage(draft),
          reportedChecks: [
            {
              condition: "policySafety",
              verdict: "looks-fine" as ReportedQualityCheck["verdict"],
            },
          ],
          evaluatedAt,
        }),
      /needs a verdict/,
    );
  });

  it("refuses a score that is not a share of a hundred", () => {
    const draft = approvedDraft();

    for (const score of [-1, 101, Number.NaN]) {
      assert.throws(
        () =>
          evaluateQualityGate({
            draft,
            chapterRightsRecord,
            lineage: chapterDraftLineage(draft),
            reportedChecks: [
              { condition: "policySafety", verdict: "pass", score },
            ],
            evaluatedAt,
          }),
        /score is a share of a hundred/,
      );
    }
  });
});

/** A draft carrying everything the record has to answer for, ready to check. */
function approvedDraft(): ChapterDraft {
  return {
    id: "chuong-1",
    seriesId: "series-cms-1",
    chapterNumber: 1,
    title: "Mùi Mưa Đầu Tiên",
    body: "Mưa rơi trên mái ngõ.",
    creativeDisclosure: "Hybrid",
    rightsRecordId: "rights-1",
    humanApproval: {
      reviewerStaffAccountId: "staff-editor-1",
      approvedAt: "2026-07-31T00:00:00.000Z",
    },
  };
}

function finding(
  findings: readonly QualityGateFinding[],
  condition: QualityGateConditionName,
): QualityGateFinding {
  const found = findings.find((entry) => entry.condition === condition);
  assert.ok(found, `no finding for ${condition}`);

  return found;
}
