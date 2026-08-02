import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  approveChapterDraft,
  authorChapterDraft,
  createSeries,
  createStaffPrincipal,
  publishChapter,
  scheduleChapterPublication,
  type ChapterDraft,
  type ChapterPublicationSchedule,
  type ProvenanceEntry,
  type PublishedSnapshot,
  type ReportedQualityCheck,
  type Series,
} from "./index.js";
import {
  chapterDraftLineage,
  chapterRightsRecord,
  passedQualityGate,
} from "./quality-gate.fixture.js";

const series: Series = createSeries({
  id: "series-1",
  title: "Thanh Kiếm Trong Mưa",
  synopsis: "A curated Vietnamese serialized story.",
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

const reviewer = createStaffPrincipal({
  staffAccountId: "staff-reviewer-1",
  permissions: ["chapter:approve"],
});

const publisher = createStaffPrincipal({
  staffAccountId: "staff-publisher-1",
  permissions: ["chapter:publish"],
});

const APPROVED_AT = "2026-08-01T10:00:00.000Z";
const PUBLISHED_AT = "2026-08-02T00:00:00.000Z";

describe("Human Approval", () => {
  it("names the reviewer accountable for a draft the Quality Gate cleared of everything else", () => {
    const approved = approveChapterDraft({
      draft: awaitingApproval({ id: "chuong-1", chapterNumber: 1 }),
      actor: reviewer,
      approvedAt: APPROVED_AT,
    });

    assert.deepEqual(approved.humanApproval, {
      reviewerStaffAccountId: "staff-reviewer-1",
      approvedAt: APPROVED_AT,
    });
  });

  /**
   * Approval is the last condition of the gate, not a way around the others: a
   * reviewer cannot sign off prose the policy-safety check refused.
   */
  it("refuses a draft the Quality Gate blocked for a reason approval cannot answer", () => {
    const draft = awaitingApproval({
      id: "chuong-1",
      chapterNumber: 1,
      reportedChecks: [
        { condition: "canonContinuity", verdict: "pass" },
        { condition: "policySafety", verdict: "blocking-failure" },
        { condition: "originalityIp", verdict: "pass" },
        { condition: "metadata", verdict: "pass" },
      ],
    });

    assert.throws(
      () =>
        approveChapterDraft({
          draft,
          actor: reviewer,
          approvedAt: APPROVED_AT,
        }),
      /blocking Quality Gate failure: policySafety/,
    );
  });

  it("refuses a draft the Quality Gate has not run on", () => {
    const draft = authorChapterDraft({
      id: "chuong-1",
      series,
      chapterNumber: 1,
      title: "Mùi Mưa Đầu Tiên",
      body: "Mưa rơi trên mái ngõ.",
    });

    assert.throws(
      () =>
        approveChapterDraft({
          draft,
          actor: reviewer,
          approvedAt: APPROVED_AT,
        }),
      /Quality Gate evaluation is required before public publishing/,
    );
  });

  /**
   * An approval names who took the decision, so a second approval must not move
   * that accountability to whoever pressed the button most recently.
   */
  it("keeps the first reviewer when an approval is repeated", () => {
    const approved = approveChapterDraft({
      draft: awaitingApproval({ id: "chuong-1", chapterNumber: 1 }),
      actor: reviewer,
      approvedAt: APPROVED_AT,
    });

    const reapproved = approveChapterDraft({
      draft: approved,
      actor: createStaffPrincipal({
        staffAccountId: "staff-reviewer-2",
        permissions: ["chapter:approve"],
      }),
      approvedAt: "2026-08-01T18:00:00.000Z",
    });

    assert.deepEqual(reapproved.humanApproval, approved.humanApproval);
  });

  it("refuses a Staff Account that may write chapters but not approve them", () => {
    assert.throws(
      () =>
        approveChapterDraft({
          draft: awaitingApproval({ id: "chuong-1", chapterNumber: 1 }),
          actor: createStaffPrincipal({
            staffAccountId: "staff-writer-1",
            permissions: ["chapter:write"],
          }),
          approvedAt: APPROVED_AT,
        }),
      /chapter:approve/,
    );
  });
});

describe("publishing an approved Chapter", () => {
  it("creates an immutable Published Snapshot separate from the draft", () => {
    const draft = approved({ id: "chuong-1", chapterNumber: 1 });

    const snapshot = publish({ draft, publishedChapterNumbers: [] });

    assert.equal(snapshot.body, draft.body);
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.publiclyReadable, true);
    assert.equal(snapshot.publishedByStaffAccountId, "staff-publisher-1");
    assert.throws(() => {
      (snapshot as { body: string }).body = "rewritten in place";
    });
  });

  /**
   * The gate result says what was on record when it ran, and approving is what
   * happens between a run and a publish — so the publishing door re-reads the
   * approval itself rather than the gate's account of it.
   */
  it("publishes a draft approved after its Quality Gate run", () => {
    const draft = approved({ id: "chuong-1", chapterNumber: 1 });

    assert.deepEqual(draft.qualityGate?.blockingFailures, ["humanApproval"]);
    assert.doesNotThrow(() => publish({ draft, publishedChapterNumbers: [] }));
  });

  it("refuses a draft nobody has approved", () => {
    assert.throws(
      () =>
        publish({
          draft: awaitingApproval({ id: "chuong-1", chapterNumber: 1 }),
          publishedChapterNumbers: [],
        }),
      /Human Approval is required before public publishing/,
    );
  });

  /**
   * A snapshot carries the grants that cleared the Chapter and the lineage
   * entry it traces, read off the records rather than off strings the draft
   * carries: what a reader can see has to be answerable afterwards.
   */
  it("carries the grants that cleared it and the lineage it traces", () => {
    const draft = approved({ id: "chuong-1", chapterNumber: 1 });

    const snapshot = publish({ draft, publishedChapterNumbers: [] });

    assert.deepEqual(snapshot.rightsRecordIds, [chapterRightsRecord.id]);
    assert.equal(snapshot.provenanceLedgerEntryId, "prov-chuong-1");
  });

  it("refuses a draft the Provenance Ledger holds no lineage for", () => {
    assert.throws(
      () =>
        publish({
          draft: approved({ id: "chuong-1", chapterNumber: 1 }),
          publishedChapterNumbers: [],
          lineage: [],
        }),
      /the Provenance Ledger holds no lineage for this draft Chapter/,
    );
  });
});

describe("publishing in sequence", () => {
  it("publishes the Chapter the Series is due next", () => {
    const snapshot = publish({
      draft: approved({ id: "chuong-2", chapterNumber: 2 }),
      publishedChapterNumbers: [1],
    });

    assert.equal(snapshot.chapterNumber, 2);
  });

  it("refuses a Chapter whose predecessor readers have not seen yet", () => {
    assert.throws(
      () =>
        publish({
          draft: approved({ id: "chuong-3", chapterNumber: 3 }),
          publishedChapterNumbers: [1],
        }),
      /Chapter 3 cannot be published before Chapter 2/,
    );
  });

  /**
   * Publishing a Chapter twice would be a second version of it without the
   * reason a revision carries, so it is refused as the fix it is being used as.
   */
  it("refuses a Chapter that is already published", () => {
    assert.throws(
      () =>
        publish({
          draft: approved({ id: "chuong-1", chapterNumber: 1 }),
          publishedChapterNumbers: [1],
        }),
      /already published/,
    );
  });
});

describe("Publication Schedule", () => {
  it("schedules an approved Chapter for the time it becomes public", () => {
    const schedule = scheduleChapterPublication({
      series,
      draft: approved({ id: "chuong-1", chapterNumber: 1 }),
      actor: publisher,
      scheduledFor: PUBLISHED_AT,
      scheduledAt: APPROVED_AT,
    });

    assert.equal(schedule.chapterId, "chuong-1");
    assert.equal(schedule.chapterNumber, 1);
    assert.equal(schedule.scheduledFor, PUBLISHED_AT);
    assert.equal(schedule.scheduledByStaffAccountId, "staff-publisher-1");
  });

  it("refuses to schedule a draft nobody has approved", () => {
    assert.throws(
      () =>
        scheduleChapterPublication({
          series,
          draft: awaitingApproval({ id: "chuong-1", chapterNumber: 1 }),
          actor: publisher,
          scheduledFor: PUBLISHED_AT,
          scheduledAt: APPROVED_AT,
        }),
      /Human Approval is required before public publishing/,
    );
  });

  it("refuses to publish a scheduled Chapter before it is due", () => {
    const draft = approved({ id: "chuong-1", chapterNumber: 1 });

    assert.throws(
      () =>
        publish({
          draft,
          publishedChapterNumbers: [],
          schedule: scheduledFor(draft, PUBLISHED_AT),
          publishedAt: "2026-08-01T23:59:59.000Z",
        }),
      /scheduled for 2026-08-02T00:00:00.000Z/,
    );
  });

  it("publishes a scheduled Chapter once it is due", () => {
    const draft = approved({ id: "chuong-1", chapterNumber: 1 });

    const snapshot = publish({
      draft,
      publishedChapterNumbers: [],
      schedule: scheduledFor(draft, PUBLISHED_AT),
    });

    assert.equal(snapshot.publiclyReadable, true);
  });

  it("refuses a schedule that belongs to another Chapter", () => {
    const scheduled = approved({ id: "chuong-1", chapterNumber: 1 });

    assert.throws(
      () =>
        publish({
          draft: approved({ id: "chuong-2", chapterNumber: 2 }),
          publishedChapterNumbers: [1],
          schedule: scheduledFor(scheduled, PUBLISHED_AT),
        }),
      /Publication Schedule names Chapter chuong-1, not chuong-2/,
    );
  });
});

type DraftFixture = {
  id: string;
  chapterNumber: number;
  reportedChecks?: readonly ReportedQualityCheck[];
};

/** A draft the Quality Gate has run on, with only the approval outstanding. */
function awaitingApproval(input: DraftFixture): ChapterDraft {
  const draft: ChapterDraft = {
    ...authorChapterDraft({
      id: input.id,
      series,
      chapterNumber: input.chapterNumber,
      title: `Mùi Mưa Thứ ${input.chapterNumber}`,
      body: "Mưa rơi trên mái ngõ, và một lời thề cũ được nhắc lại trong đêm.",
    }),
    rightsRecordId: chapterRightsRecord.id,
  };

  return {
    ...draft,
    qualityGate: passedQualityGate(draft, {
      ...(input.reportedChecks ? { reportedChecks: input.reportedChecks } : {}),
    }),
  };
}

/** The same draft, with an accountable reviewer's approval on it. */
function approved(input: DraftFixture): ChapterDraft {
  return approveChapterDraft({
    draft: awaitingApproval(input),
    actor: reviewer,
    approvedAt: APPROVED_AT,
  });
}

/** Publishing as an operator does it: from the Series, and from the ledger. */
function publish(input: {
  draft: ChapterDraft;
  publishedChapterNumbers: readonly number[];
  schedule?: ChapterPublicationSchedule;
  lineage?: readonly ProvenanceEntry[];
  publishedAt?: string;
}): PublishedSnapshot {
  return publishChapter({
    series,
    draft: input.draft,
    actor: publisher,
    publishedChapterNumbers: input.publishedChapterNumbers,
    lineage: input.lineage ?? chapterDraftLineage(input.draft),
    ...(input.schedule ? { schedule: input.schedule } : {}),
    publishedAt: input.publishedAt ?? PUBLISHED_AT,
  });
}

function scheduledFor(
  draft: ChapterDraft,
  scheduledFor: string,
): ChapterPublicationSchedule {
  return scheduleChapterPublication({
    series,
    draft,
    actor: publisher,
    scheduledFor,
    scheduledAt: APPROVED_AT,
  });
}
