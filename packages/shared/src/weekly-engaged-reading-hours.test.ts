import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  acceptReadingEngagement,
  GUARDRAIL_DIMENSIONS,
  READING_ENGAGEMENT_MAX_SECONDS,
  READING_ENGAGEMENT_REFUSALS,
  ReadingEngagementRefusedError,
  weeklyEngagedReadingHours,
  type ReadingEngagement,
} from "./index.js";

const weekStart = "2026-07-27T00:00:00.000Z";
const weekEnd = "2026-08-03T00:00:00.000Z";

describe("reading engagement acceptance at the boundary", () => {
  it("accepts a chunk of engaged reading time against a Chapter", () => {
    const engagement = acceptReadingEngagement({
      readerAccountId: "reader-1",
      seriesId: "thanh-kiem-trong-mua",
      chapterId: "chuong-1",
      engagedSeconds: 120,
      position: 1842,
      occurredAt: "2026-07-31T09:00:00.000Z",
    });

    assert.deepEqual(engagement, {
      readerAccountId: "reader-1",
      seriesId: "thanh-kiem-trong-mua",
      chapterId: "chuong-1",
      engagedSeconds: 120,
      position: 1842,
      occurredAt: "2026-07-31T09:00:00.000Z",
    });
    assert.equal(Object.isFrozen(engagement), true);
  });

  it("carries an Anonymous Reader Session when no Reader Account reported it", () => {
    const engagement = acceptReadingEngagement({
      anonymousSessionId: "anon-1",
      seriesId: "thanh-kiem-trong-mua",
      chapterId: "chuong-1",
      engagedSeconds: 60,
      position: 0,
      occurredAt: "2026-07-31T09:00:00.000Z",
    });

    assert.equal(engagement.anonymousSessionId, "anon-1");
    assert.equal(engagement.readerAccountId, undefined);
  });

  it("refuses an engagement that names no Chapter", () => {
    assert.throws(
      () =>
        acceptReadingEngagement({
          anonymousSessionId: "anon-1",
          seriesId: "  ",
          chapterId: "",
          engagedSeconds: 60,
          position: 0,
          occurredAt: "2026-07-31T09:00:00.000Z",
        }),
      (error: unknown) =>
        error instanceof ReadingEngagementRefusedError &&
        error.code === "reading-engagement-needs-a-chapter",
    );
  });

  it("refuses an engagement with no reading time as obvious noise", () => {
    assert.throws(
      () =>
        acceptReadingEngagement({
          anonymousSessionId: "anon-1",
          seriesId: "thanh-kiem-trong-mua",
          chapterId: "chuong-1",
          engagedSeconds: 0,
          position: 0,
          occurredAt: "2026-07-31T09:00:00.000Z",
        }),
      (error: unknown) =>
        error instanceof ReadingEngagementRefusedError &&
        error.code === "reading-engagement-needs-valid-seconds",
    );
  });

  it("refuses an engagement that claims more reading time than a reader could do in one sitting", () => {
    assert.throws(
      () =>
        acceptReadingEngagement({
          anonymousSessionId: "anon-1",
          seriesId: "thanh-kiem-trong-mua",
          chapterId: "chuong-1",
          engagedSeconds: READING_ENGAGEMENT_MAX_SECONDS + 1,
          position: 0,
          occurredAt: "2026-07-31T09:00:00.000Z",
        }),
      (error: unknown) =>
        error instanceof ReadingEngagementRefusedError &&
        error.code === "reading-engagement-needs-valid-seconds",
    );
  });

  it("refuses an engagement with a negative position", () => {
    assert.throws(
      () =>
        acceptReadingEngagement({
          anonymousSessionId: "anon-1",
          seriesId: "thanh-kiem-trong-mua",
          chapterId: "chuong-1",
          engagedSeconds: 60,
          position: -1,
          occurredAt: "2026-07-31T09:00:00.000Z",
        }),
      (error: unknown) =>
        error instanceof ReadingEngagementRefusedError &&
        error.code === "reading-engagement-needs-valid-position",
    );
  });

  it("refuses an engagement that occurred at no parseable time", () => {
    assert.throws(
      () =>
        acceptReadingEngagement({
          anonymousSessionId: "anon-1",
          seriesId: "thanh-kiem-trong-mua",
          chapterId: "chuong-1",
          engagedSeconds: 60,
          position: 0,
          occurredAt: "not-a-moment",
        }),
      (error: unknown) =>
        error instanceof ReadingEngagementRefusedError &&
        error.code === "reading-engagement-needs-valid-time",
    );
  });

  it("refuses an engagement with no reader identity", () => {
    assert.throws(
      () =>
        acceptReadingEngagement({
          seriesId: "thanh-kiem-trong-mua",
          chapterId: "chuong-1",
          engagedSeconds: 60,
          position: 0,
          occurredAt: "2026-07-31T09:00:00.000Z",
        }),
      (error: unknown) =>
        error instanceof ReadingEngagementRefusedError &&
        error.code === "reading-engagement-needs-a-reader",
    );
  });

  it("refuses an engagement claiming both reader identities", () => {
    assert.throws(
      () =>
        acceptReadingEngagement({
          readerAccountId: "reader-1",
          anonymousSessionId: "anon-1",
          seriesId: "thanh-kiem-trong-mua",
          chapterId: "chuong-1",
          engagedSeconds: 60,
          position: 0,
          occurredAt: "2026-07-31T09:00:00.000Z",
        }),
      (error: unknown) =>
        error instanceof ReadingEngagementRefusedError &&
        error.code === "reading-engagement-needs-a-reader",
    );
  });

  it("names every refusal a boundary can return", () => {
    assert.deepEqual([...READING_ENGAGEMENT_REFUSALS].sort(), [
      "reading-engagement-needs-a-chapter",
      "reading-engagement-needs-a-reader",
      "reading-engagement-needs-valid-position",
      "reading-engagement-needs-valid-seconds",
      "reading-engagement-needs-valid-time",
    ]);
  });
});

describe("Weekly Engaged Reading Hours calculation", () => {
  it("sums engaged reading time in the week window as hours", () => {
    const engagements: ReadingEngagement[] = [
      engagement({
        engagedSeconds: 600,
        occurredAt: "2026-07-28T09:00:00.000Z",
      }),
      engagement({
        engagedSeconds: 600,
        occurredAt: "2026-08-01T21:00:00.000Z",
      }),
    ];

    const metric = weeklyEngagedReadingHours({
      engagements,
      weekStart,
      weekEnd,
    });

    assert.equal(metric.totalEngagedSeconds, 1200);
    assert.equal(metric.engagedReadingHours, 0.333);
    assert.equal(metric.engagementCount, 2);
    assert.equal(metric.weekStart, weekStart);
    assert.equal(metric.weekEnd, weekEnd);
  });

  it("counts two short chunks the same as one long one of the same duration", () => {
    const splitIntoTwo = weeklyEngagedReadingHours({
      engagements: [
        engagement({
          engagedSeconds: 300,
          occurredAt: "2026-07-30T09:00:00.000Z",
        }),
        engagement({
          engagedSeconds: 300,
          occurredAt: "2026-07-30T09:30:00.000Z",
        }),
      ],
      weekStart,
      weekEnd,
    });
    const asOne = weeklyEngagedReadingHours({
      engagements: [
        engagement({
          engagedSeconds: 600,
          occurredAt: "2026-07-30T09:00:00.000Z",
        }),
      ],
      weekStart,
      weekEnd,
    });

    assert.equal(splitIntoTwo.engagedReadingHours, asOne.engagedReadingHours);
  });

  it("ignores engagements outside the week window", () => {
    const metric = weeklyEngagedReadingHours({
      engagements: [
        engagement({
          engagedSeconds: 600,
          occurredAt: "2026-07-26T23:59:00.000Z",
        }),
        engagement({ engagedSeconds: 600, occurredAt: weekStart }),
        engagement({ engagedSeconds: 600, occurredAt: weekEnd }),
        engagement({
          engagedSeconds: 600,
          occurredAt: "2026-08-03T00:00:01.000Z",
        }),
      ],
      weekStart,
      weekEnd,
    });

    assert.equal(metric.engagementCount, 1);
    assert.equal(metric.totalEngagedSeconds, 600);
  });

  it("reads zero hours when no reader engaged in the week", () => {
    const metric = weeklyEngagedReadingHours({
      engagements: [],
      weekStart,
      weekEnd,
    });

    assert.equal(metric.engagedReadingHours, 0);
    assert.equal(metric.totalEngagedSeconds, 0);
    assert.equal(metric.engagementCount, 0);
  });

  it("aggregates reader and anonymous reading time together", () => {
    const metric = weeklyEngagedReadingHours({
      engagements: [
        acceptReadingEngagement({
          readerAccountId: "reader-1",
          seriesId: "thanh-kiem-trong-mua",
          chapterId: "chuong-1",
          engagedSeconds: 900,
          position: 100,
          occurredAt: "2026-07-31T09:00:00.000Z",
        }),
        acceptReadingEngagement({
          anonymousSessionId: "anon-1",
          seriesId: "thanh-kiem-trong-mua",
          chapterId: "chuong-1",
          engagedSeconds: 900,
          position: 50,
          occurredAt: "2026-07-31T10:00:00.000Z",
        }),
      ],
      weekStart,
      weekEnd,
    });

    assert.equal(metric.totalEngagedSeconds, 1800);
    assert.equal(metric.engagedReadingHours, 0.5);
  });
});

describe("guardrail signal hooks", () => {
  it("names the four dimensions Weekly Engaged Reading Hours is read against", () => {
    assert.deepEqual(
      [...GUARDRAIL_DIMENSIONS],
      [
        "d30Retention",
        "reportRate",
        "aiCostPerApprovedChapter",
        "adComplaints",
      ],
    );
  });
});

function engagement(overrides: {
  engagedSeconds: number;
  occurredAt: string;
}): ReadingEngagement {
  return acceptReadingEngagement({
    anonymousSessionId: "anon-1",
    seriesId: "thanh-kiem-trong-mua",
    chapterId: "chuong-1",
    position: 0,
    ...overrides,
  });
}
