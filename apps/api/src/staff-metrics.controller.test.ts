import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createAnonymousReaderPrincipal,
  createReaderPrincipal,
  type ReadingEngagement,
  type WeeklyEngagedReadingHoursMetric,
} from "@novelx/shared";

import { restoreEnv, withApi, type ApiClient } from "./api-test-client.js";
import { signReaderSessionToken } from "./reader-session-token.js";

const metricsCredential = "staff-product-1-access-credential";
const publisherCredential = "staff-publisher-1-access-credential";
const readerSecret = "reader-session-secret-for-tests";

/**
 * Two Staff Accounts: one that may read the metric, and one that may not. The
 * product owner reads Weekly Engaged Reading Hours; a publisher who lacks the
 * permission is refused, because the metric is a privileged read.
 */
const staffAccounts = JSON.stringify([
  {
    id: "staff-product-1",
    permissions: ["series:read", "metrics:read"],
    credentialSha256: createHash("sha256")
      .update(metricsCredential)
      .digest("hex"),
  },
  {
    id: "staff-publisher-1",
    permissions: ["series:read", "chapter:publish"],
    credentialSha256: createHash("sha256")
      .update(publisherCredential)
      .digest("hex"),
  },
]);

const originalEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  READER_SESSION_SECRET: process.env.READER_SESSION_SECRET,
  STAFF_ACCOUNTS: process.env.STAFF_ACCOUNTS,
  STAFF_SESSION_SECRET: process.env.STAFF_SESSION_SECRET,
};

const seriesId = "thanh-kiem-trong-mua";
const chapterId = "chuong-1";

beforeEach(() => {
  delete process.env.DATABASE_URL;
  process.env.STAFF_ACCOUNTS = staffAccounts;
  process.env.STAFF_SESSION_SECRET = "staff-session-secret-for-tests";
  process.env.READER_SESSION_SECRET = readerSecret;
});

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    restoreEnv(name, value);
  }
});

describe("reading engagement recording", () => {
  it("records a chunk of engaged reading time from a Reader Account", async () => {
    await withApi(async (api) => {
      const recorded = await api<ReadingEngagement>(
        "POST",
        "/reader/engagement",
        {
          headers: readerHeaders(),
          body: {
            seriesId,
            chapterId,
            engagedSeconds: 120,
            position: 1842,
          },
        },
      );

      assert.equal(recorded.status, 201);
      assert.equal(recorded.body.engagedSeconds, 120);
      assert.equal(recorded.body.readerAccountId, "reader-1");
      assert.equal(recorded.body.seriesId, seriesId);
    });
  });

  it("records engaged reading time from an Anonymous Reader Session", async () => {
    await withApi(async (api) => {
      const recorded = await api<ReadingEngagement>(
        "POST",
        "/reader/engagement",
        {
          headers: anonymousHeaders(),
          body: {
            seriesId,
            chapterId,
            engagedSeconds: 60,
            position: 0,
          },
        },
      );

      assert.equal(recorded.status, 201);
      assert.equal(recorded.body.anonymousSessionId, "anon-1");
    });
  });

  it("starts an Anonymous Reader Session for a reader who holds no token", async () => {
    await withApi(async (api) => {
      const started = await api<{ token: string }>("POST", "/reader/sessions", {
        headers: {},
      });
      assert.equal(started.status, 201);

      const recorded = await api<ReadingEngagement>(
        "POST",
        "/reader/engagement",
        {
          headers: { authorization: `Bearer ${started.body.token}` },
          body: { seriesId, chapterId, engagedSeconds: 45, position: 10 },
        },
      );

      assert.equal(recorded.status, 201);
    });
  });

  it("refuses obvious noise: an engagement that claims no reading time", async () => {
    await withApi(async (api) => {
      const recorded = await api<{ error: string }>(
        "POST",
        "/reader/engagement",
        {
          headers: readerHeaders(),
          body: { seriesId, chapterId, engagedSeconds: 0, position: 0 },
        },
      );

      assert.equal(recorded.status, 400);
      assert.equal(
        recorded.body.error,
        "reading-engagement-needs-valid-seconds",
      );
    });
  });

  it("refuses obvious noise: an engagement longer than a reader could read in one sitting", async () => {
    await withApi(async (api) => {
      const recorded = await api<{ error: string }>(
        "POST",
        "/reader/engagement",
        {
          headers: readerHeaders(),
          body: { seriesId, chapterId, engagedSeconds: 99999, position: 0 },
        },
      );

      assert.equal(recorded.status, 400);
      assert.equal(
        recorded.body.error,
        "reading-engagement-needs-valid-seconds",
      );
    });
  });

  it("refuses an engagement against a Chapter that is not public", async () => {
    await withApi(async (api) => {
      const recorded = await api("POST", "/reader/engagement", {
        headers: readerHeaders(),
        body: {
          seriesId,
          chapterId: "chuong-chua-cong-khai",
          engagedSeconds: 60,
          position: 0,
        },
      });

      assert.equal(recorded.status, 404);
    });
  });
});

describe("Weekly Engaged Reading Hours metric output", () => {
  it("sums accepted engagements into engaged reading hours for the week", async () => {
    await withApi(async (api) => {
      await api("POST", "/reader/engagement", {
        headers: readerHeaders(),
        body: { seriesId, chapterId, engagedSeconds: 1800, position: 100 },
      });
      await api("POST", "/reader/engagement", {
        headers: anonymousHeaders(),
        body: { seriesId, chapterId, engagedSeconds: 1800, position: 50 },
      });

      const metric = await api<WeeklyEngagedReadingHoursMetric>(
        "GET",
        "/staff/metrics/weekly-engaged-reading-hours",
        {
          headers: await staffHeaders(
            api,
            "staff-product-1",
            metricsCredential,
          ),
        },
      );

      assert.equal(metric.status, 200);
      assert.equal(
        metric.body.weeklyEngagedReadingHours.totalEngagedSeconds,
        3600,
      );
      assert.equal(
        metric.body.weeklyEngagedReadingHours.engagedReadingHours,
        1,
      );
      assert.equal(metric.body.weeklyEngagedReadingHours.engagementCount, 2);
    });
  });

  it("carries the guardrail hooks the north-star is read against", async () => {
    await withApi(async (api) => {
      const metric = await api<WeeklyEngagedReadingHoursMetric>(
        "GET",
        "/staff/metrics/weekly-engaged-reading-hours",
        {
          headers: await staffHeaders(
            api,
            "staff-product-1",
            metricsCredential,
          ),
        },
      );

      assert.equal(metric.status, 200);
      // Baseline guardrail hooks exist; real sources are deferred, so each is
      // absent rather than zero.
      assert.deepEqual(metric.body.guardrails, {});
    });
  });

  it("reads zero hours when no reader has engaged this week", async () => {
    await withApi(async (api) => {
      const metric = await api<WeeklyEngagedReadingHoursMetric>(
        "GET",
        "/staff/metrics/weekly-engaged-reading-hours",
        {
          headers: await staffHeaders(
            api,
            "staff-product-1",
            metricsCredential,
          ),
        },
      );

      assert.equal(
        metric.body.weeklyEngagedReadingHours.engagedReadingHours,
        0,
      );
      assert.equal(metric.body.weeklyEngagedReadingHours.engagementCount, 0);
    });
  });

  it("refuses a reader session that is not Staff", async () => {
    await withApi(async (api) => {
      const metric = await api<{ error: string }>(
        "GET",
        "/staff/metrics/weekly-engaged-reading-hours",
        { headers: readerHeaders() },
      );

      assert.equal(metric.status, 401);
      assert.equal(metric.body.error, "staff-access-required");
    });
  });

  it("refuses a Staff Account that lacks the metrics:read permission", async () => {
    await withApi(async (api) => {
      const metric = await api<{ error: string }>(
        "GET",
        "/staff/metrics/weekly-engaged-reading-hours",
        {
          headers: await staffHeaders(
            api,
            "staff-publisher-1",
            publisherCredential,
          ),
        },
      );

      assert.equal(metric.status, 403);
      assert.equal(metric.body.error, "staff-access-required");
    });
  });
});

function readerHeaders(): Record<string, string> {
  return sessionHeaders(createReaderPrincipal({ readerAccountId: "reader-1" }));
}

function anonymousHeaders(): Record<string, string> {
  return sessionHeaders(
    createAnonymousReaderPrincipal({ anonymousSessionId: "anon-1" }),
  );
}

function sessionHeaders(
  principal: Parameters<typeof signReaderSessionToken>[0]["principal"],
): Record<string, string> {
  return {
    authorization: `Bearer ${signReaderSessionToken({
      principal,
      secret: readerSecret,
      issuedAt: "2026-08-01T08:00:00.000Z",
    })}`,
  };
}

async function staffHeaders(
  api: ApiClient,
  staffAccountId: string,
  credential: string,
): Promise<Record<string, string>> {
  const signedIn = await api<{ token: string }>("POST", "/staff/sessions", {
    body: { staffAccountId, credential },
  });

  return { "x-staff-authorization": `Staff ${signedIn.body.token}` };
}
