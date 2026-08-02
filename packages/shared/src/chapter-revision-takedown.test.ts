import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  approveChapterDraft,
  authorChapterDraft,
  createSeries,
  createStaffPrincipal,
  publishChapter,
  reviseChapterDraft,
  revisePublishedChapter,
  takeDownPublishedChapter,
  type ChapterDraft,
  type ChapterTakedown,
  type PublishedSnapshot,
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

const otherSeries: Series = createSeries({
  ...series,
  id: "series-2",
  title: "Một Series Khác",
});

const reviewer = createStaffPrincipal({
  staffAccountId: "staff-reviewer-1",
  permissions: ["chapter:approve"],
});

const publisher = createStaffPrincipal({
  staffAccountId: "staff-publisher-1",
  permissions: ["chapter:publish"],
});

const moderator = createStaffPrincipal({
  staffAccountId: "staff-moderator-1",
  permissions: ["chapter:takedown"],
});

const APPROVED_AT = "2026-08-01T10:00:00.000Z";
const PUBLISHED_AT = "2026-08-02T00:00:00.000Z";
const REVISED_AT = "2026-08-03T00:00:00.000Z";
const TAKEN_DOWN_AT = "2026-08-04T00:00:00.000Z";

const FIX_REASON = "Sửa tên nhân vật sai trong đoạn cuối (ticket EDIT-101)";
const TAKEDOWN_REASON = "Khiếu nại bản quyền từ chủ sở hữu (ticket LEGAL-7)";

describe("revising the prose of a draft Chapter", () => {
  /**
   * The same rule attaching material follows, for the same reason: what the
   * gate judged and what the reviewer signed off was this prose.
   */
  it("takes the Quality Gate result and the approval off a rewritten draft", () => {
    const draft = approved({ id: "chuong-1", chapterNumber: 1 });

    const revised = reviseChapterDraft({
      draft,
      body: "Mưa tạnh, và lời thề cũ được nhắc lại một lần nữa.",
    });

    assert.equal(
      revised.body,
      "Mưa tạnh, và lời thề cũ được nhắc lại một lần nữa.",
    );
    assert.equal(revised.qualityGate, undefined);
    assert.equal(revised.humanApproval, undefined);
  });

  it("leaves a draft alone when the revision changes nothing", () => {
    const draft = approved({ id: "chuong-1", chapterNumber: 1 });

    const revised = reviseChapterDraft({
      draft,
      title: draft.title,
      body: draft.body,
    });

    assert.equal(revised, draft);
    assert.equal(
      revised.humanApproval?.reviewerStaffAccountId,
      reviewer.staffAccountId,
    );
  });

  it("refuses a revision that leaves the Chapter without prose", () => {
    assert.throws(
      () =>
        reviseChapterDraft({
          draft: approved({ id: "chuong-1", chapterNumber: 1 }),
          body: "   ",
        }),
      /a draft Chapter needs a title and prose/,
    );
  });
});

describe("revising a published Chapter", () => {
  it("publishes a new version and leaves the previous snapshot exactly as readers saw it", () => {
    const first = publishedChapter();

    const revised = revise({ previousSnapshot: first });

    assert.equal(first.version, 1);
    assert.equal(first.body, originalBody);
    assert.equal(revised.version, 2);
    assert.equal(revised.body, fixedBody);
    assert.notEqual(revised.id, first.id);
    assert.throws(() => {
      (first as { body: string }).body = "rewritten in place";
    });
  });

  /**
   * A post-publication fix is only accountable if the record says why it
   * happened and what it replaced.
   */
  it("names the snapshot it replaced, the reason, and the Staff Account behind it", () => {
    const first = publishedChapter();

    const revised = revise({ previousSnapshot: first });

    assert.deepEqual(revised.revision, {
      supersedesSnapshotId: first.id,
      reason: FIX_REASON,
    });
    assert.equal(revised.publishedByStaffAccountId, publisher.staffAccountId);
    assert.equal(revised.publishedAt, REVISED_AT);
  });

  it("leaves a first publication with no revision to explain", () => {
    assert.equal(publishedChapter().revision, undefined);
  });

  it("refuses a fix nobody explained", () => {
    assert.throws(
      () => revise({ previousSnapshot: publishedChapter(), reason: "  " }),
      /post-publication fixes require an accountable reason/,
    );
  });

  it("refuses a fix carrying another Chapter's prose", () => {
    assert.throws(
      () =>
        revise({
          previousSnapshot: publishedChapter(),
          fixedDraft: approved({ id: "chuong-2", chapterNumber: 2 }),
        }),
      /post-publication fix must target the same Chapter/,
    );
  });

  it("refuses a fix presented under a Series that does not hold the Chapter", () => {
    assert.throws(
      () =>
        revise({ previousSnapshot: publishedChapter(), series: otherSeries }),
      /chapter draft does not belong to the Series/,
    );
  });

  /** A fix goes back through the gate: the prose it publishes is new prose. */
  it("refuses a fix no reviewer has approved", () => {
    const first = publishedChapter();
    const rewritten = reviseChapterDraft({
      draft: approved({ id: "chuong-1", chapterNumber: 1 }),
      body: fixedBody,
    });

    assert.throws(
      () => revise({ previousSnapshot: first, fixedDraft: rewritten }),
      /Quality Gate evaluation is required before public publishing/,
    );
  });

  it("refuses to republish a Chapter distribution has been stopped for", () => {
    const first = publishedChapter();

    assert.throws(
      () => revise({ previousSnapshot: first, takedown: takeDown(first) }),
      /distribution of Chapter chuong-1 has been stopped/,
    );
  });
});

describe("taking a published Chapter down", () => {
  it("stops distribution while naming the snapshot, the reason, and the accountable Staff Account", () => {
    const snapshot = publishedChapter();

    const takedown = takeDown(snapshot);

    assert.deepEqual(takedown, {
      seriesId: series.id,
      chapterId: snapshot.chapterId,
      snapshotId: snapshot.id,
      reason: TAKEDOWN_REASON,
      takenDownByStaffAccountId: moderator.staffAccountId,
      takenDownAt: TAKEN_DOWN_AT,
    });
  });

  /**
   * Takedown blocks distribution; it does not delete evidence. The snapshot it
   * names is the one readers saw, unchanged (ADR-0003).
   */
  it("leaves the Published Snapshot it names untouched", () => {
    const snapshot = publishedChapter();

    const takedown = takeDown(snapshot);

    assert.equal(takedown.snapshotId, snapshot.id);
    assert.equal(snapshot.body, originalBody);
    assert.throws(() => {
      (snapshot as { body: string }).body = "erased";
    });
  });

  it("refuses a takedown nobody explained", () => {
    assert.throws(
      () => takeDown(publishedChapter(), { reason: "" }),
      /a takedown requires the reason distribution stopped/,
    );
  });

  /** Taking content away from readers is its own authority, not publishing's. */
  it("refuses a Staff Account that may publish but not take down", () => {
    assert.throws(
      () => takeDown(publishedChapter(), { actor: publisher }),
      /chapter:takedown/,
    );
  });
});

const originalBody = "Mưa rơi trên mái ngõ, và một lời thề cũ được nhắc lại.";
const fixedBody = "Mưa rơi trên mái ngói, và một lời thề cũ được nhắc lại.";

type DraftFixture = { id: string; chapterNumber: number; body?: string };

/** A draft the Quality Gate has run on, with only the approval outstanding. */
function awaitingApproval(input: DraftFixture): ChapterDraft {
  const draft: ChapterDraft = {
    ...authorChapterDraft({
      id: input.id,
      series,
      chapterNumber: input.chapterNumber,
      title: `Mùi Mưa Thứ ${input.chapterNumber}`,
      body: input.body ?? originalBody,
    }),
    rightsRecordId: chapterRightsRecord.id,
  };

  return { ...draft, qualityGate: passedQualityGate(draft) };
}

function approved(input: DraftFixture): ChapterDraft {
  return approveChapterDraft({
    draft: awaitingApproval(input),
    actor: reviewer,
    approvedAt: APPROVED_AT,
  });
}

function publishedChapter(): PublishedSnapshot {
  const draft = approved({ id: "chuong-1", chapterNumber: 1 });

  return publishChapter({
    series,
    draft,
    actor: publisher,
    publishedChapterNumbers: [],
    lineage: chapterDraftLineage(draft),
    publishedAt: PUBLISHED_AT,
  });
}

/** A post-publication fix, as an operator makes one: new prose, back through
 * the gate, and a reason on the record. */
function revise(input: {
  previousSnapshot: PublishedSnapshot;
  series?: Series;
  fixedDraft?: ChapterDraft;
  reason?: string;
  takedown?: ChapterTakedown;
}): PublishedSnapshot {
  const fixedDraft =
    input.fixedDraft ??
    approved({ id: "chuong-1", chapterNumber: 1, body: fixedBody });

  return revisePublishedChapter({
    series: input.series ?? series,
    previousSnapshot: input.previousSnapshot,
    fixedDraft,
    actor: publisher,
    lineage: chapterDraftLineage(fixedDraft),
    reason: input.reason ?? FIX_REASON,
    ...(input.takedown ? { takedown: input.takedown } : {}),
    publishedAt: REVISED_AT,
  });
}

function takeDown(
  snapshot: PublishedSnapshot,
  overrides: { reason?: string; actor?: typeof moderator } = {},
): ChapterTakedown {
  return takeDownPublishedChapter({
    snapshot,
    actor: overrides.actor ?? moderator,
    reason: overrides.reason ?? TAKEDOWN_REASON,
    takenDownAt: TAKEN_DOWN_AT,
  });
}
