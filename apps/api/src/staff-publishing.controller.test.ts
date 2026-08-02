import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createReaderPrincipal,
  type ChapterDraft,
  type ChapterPublicationSchedule,
  type ChapterTakedown,
  type ManagedTaxonomy,
  type ProvenanceEntry,
  type PublicCatalogSeries,
  type PublishedSnapshot,
  type ReportedQualityCheck,
} from "@novelx/shared";

import { restoreEnv, withApi, type ApiClient } from "./api-test-client.js";
import { signReaderSessionToken } from "./reader-session-token.js";

const editorCredential = "staff-editor-1-access-credential";
const reviewerCredential = "staff-reviewer-1-access-credential";
const publisherCredential = "staff-publisher-1-access-credential";
const moderatorCredential = "staff-moderator-1-access-credential";
const readerSecret = "reader-session-secret-for-tests";

/**
 * Four Staff Accounts, because publishing is where the separations matter:
 * writing the prose, taking accountability for it, putting it in front of
 * readers, and taking it back away are four authorities, and no account here
 * holds two of them.
 */
const staffAccounts = JSON.stringify([
  {
    id: "staff-editor-1",
    permissions: [
      "series:write",
      "series:read",
      "canon:write",
      "chapter:write",
      "chapter:quality-gate",
      "rights:write",
      "provenance:read",
      "audit:read",
    ],
    credentialSha256: createHash("sha256")
      .update(editorCredential)
      .digest("hex"),
  },
  {
    id: "staff-reviewer-1",
    permissions: ["series:read", "chapter:approve"],
    credentialSha256: createHash("sha256")
      .update(reviewerCredential)
      .digest("hex"),
  },
  {
    id: "staff-publisher-1",
    permissions: ["series:read", "chapter:publish"],
    credentialSha256: createHash("sha256")
      .update(publisherCredential)
      .digest("hex"),
  },
  {
    id: "staff-moderator-1",
    permissions: ["series:read", "chapter:takedown"],
    credentialSha256: createHash("sha256")
      .update(moderatorCredential)
      .digest("hex"),
  },
]);

const originalEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  READER_SESSION_SECRET: process.env.READER_SESSION_SECRET,
  STAFF_ACCOUNTS: process.env.STAFF_ACCOUNTS,
  STAFF_SESSION_SECRET: process.env.STAFF_SESSION_SECRET,
};

const taxonomy: ManagedTaxonomy = {
  genre: "fantasy",
  subgenre: "kiem-hiep",
  tropes: ["hidden-lineage"],
  moods: ["hopeful"],
  themes: ["loyalty"],
  audience: "young-adult",
  ageRating: "13+",
  contentWarnings: ["violence"],
};

const seriesId = "series-publishing-1";

const seriesBody = {
  id: seriesId,
  title: "Thanh Kiếm Trong Mưa",
  synopsis: "Một series tiên hiệp trong catalog tuyển chọn của NovelX.",
  creativeDisclosure: "Hybrid",
  taxonomy,
};

const material = { id: "source-outline-publishing-1", kind: "source-material" };

const rightsRecordBody = {
  id: "rights-publishing-1",
  material,
  owner: "NovelX Editorial",
  scope: ["publishing"],
  territories: ["VN"],
  duration: { from: "2026-01-01T00:00:00.000Z" },
  modificationAllowed: true,
  aiUseAllowed: false,
  evidence: { kind: "work-for-hire", reference: "contract-2026-101" },
};

const reportedChecks: readonly ReportedQualityCheck[] = [
  { condition: "canonContinuity", verdict: "pass", score: 96 },
  { condition: "policySafety", verdict: "pass", score: 99 },
  { condition: "originalityIp", verdict: "pass", score: 97 },
  { condition: "metadata", verdict: "pass", score: 100 },
];

const LONG_AFTER = "2099-01-01T00:00:00.000Z";
const LONG_AGO = "2026-01-02T00:00:00.000Z";

const ORIGINAL_BODY = "Mưa rơi trên mái ngõ, và một lời thề cũ được nhắc lại.";
const FIXED_BODY = "Mưa rơi trên mái ngói, và một lời thề cũ được nhắc lại.";
const FIX_REASON = "Sửa tên nhân vật sai trong đoạn cuối (ticket EDIT-101)";
const TAKEDOWN_REASON = "Khiếu nại bản quyền từ chủ sở hữu (ticket LEGAL-7)";

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

describe("publishing an approved Chapter", () => {
  it("puts a Published Snapshot on the public reader path", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await approvedChapter(api, staff, {
        id: "chuong-pub-1",
        chapterNumber: 1,
      });

      const published = await api<PublishedSnapshot>(
        "POST",
        publicationPath("chuong-pub-1"),
        { headers: staff.publisher },
      );

      assert.equal(published.status, 201);
      assert.equal(published.body.version, 1);
      assert.deepEqual(published.body.rightsRecordIds, ["rights-publishing-1"]);
      assert.equal(
        published.body.publishedByStaffAccountId,
        "staff-publisher-1",
      );

      const read = await api<PublishedSnapshot>(
        "GET",
        `/catalog/series/${seriesId}/chapters/chuong-pub-1`,
      );

      assert.equal(read.status, 200);
      assert.equal(read.body.body, published.body.body);
      assert.equal(read.body.id, published.body.id);
    });
  });

  it("brings the Series into the public catalog with the Chapter readers start at", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await approvedChapter(api, staff, {
        id: "chuong-pub-1",
        chapterNumber: 1,
      });

      const before = await api<PublicCatalogSeries[]>("GET", "/catalog/series");
      assert.equal(
        before.body.some((series) => series.id === seriesId),
        false,
        "a Series with no Published Snapshot is not public",
      );

      await api("POST", publicationPath("chuong-pub-1"), {
        headers: staff.publisher,
      });

      const after = await api<PublicCatalogSeries[]>("GET", "/catalog/series");
      const series = after.body.find((candidate) => candidate.id === seriesId);

      assert.equal(series?.firstPublicChapterId, "chuong-pub-1");
      assert.equal(series?.title, "Thanh Kiếm Trong Mưa");
    });
  });

  /**
   * The snapshot is the public version, and the draft stays where drafts live.
   * A Chapter nobody published has no public route at all, which is the whole
   * point of keeping the two apart.
   */
  it("leaves an unpublished draft with no public route", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await approvedChapter(api, staff, {
        id: "chuong-pub-1",
        chapterNumber: 1,
      });

      const read = await api(
        "GET",
        `/catalog/series/${seriesId}/chapters/chuong-pub-1`,
      );

      assert.equal(read.status, 404);
    });
  });

  it("refuses a Chapter nobody has approved", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await gatedChapter(api, staff, { id: "chuong-pub-1", chapterNumber: 1 });

      const published = await api<{ error: string }>(
        "POST",
        publicationPath("chuong-pub-1"),
        { headers: staff.publisher },
      );

      assert.equal(published.status, 409);
      assert.equal(published.body.error, "human-approval-required");
    });
  });
});

describe("publishing in sequence", () => {
  it("refuses a Chapter whose predecessor readers cannot see yet", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await approvedChapter(api, staff, {
        id: "chuong-pub-1",
        chapterNumber: 1,
      });
      await approvedChapter(api, staff, {
        id: "chuong-pub-2",
        chapterNumber: 2,
      });

      const published = await api<{ error: string }>(
        "POST",
        publicationPath("chuong-pub-2"),
        { headers: staff.publisher },
      );

      assert.equal(published.status, 409);
      assert.equal(published.body.error, "chapter-out-of-sequence");
    });
  });

  it("publishes the next Chapter once the one before it is out", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await approvedChapter(api, staff, {
        id: "chuong-pub-1",
        chapterNumber: 1,
      });
      await approvedChapter(api, staff, {
        id: "chuong-pub-2",
        chapterNumber: 2,
      });

      await api("POST", publicationPath("chuong-pub-1"), {
        headers: staff.publisher,
      });
      const published = await api<PublishedSnapshot>(
        "POST",
        publicationPath("chuong-pub-2"),
        { headers: staff.publisher },
      );

      assert.equal(published.status, 201);
      assert.equal(published.body.chapterNumber, 2);
    });
  });

  it("refuses to publish the same Chapter twice", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await approvedChapter(api, staff, {
        id: "chuong-pub-1",
        chapterNumber: 1,
      });

      await api("POST", publicationPath("chuong-pub-1"), {
        headers: staff.publisher,
      });
      const again = await api<{ error: string }>(
        "POST",
        publicationPath("chuong-pub-1"),
        { headers: staff.publisher },
      );

      assert.equal(again.status, 409);
      assert.equal(again.body.error, "chapter-already-published");
    });
  });
});

describe("scheduling a Chapter", () => {
  it("holds a scheduled Chapter until it is due", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await approvedChapter(api, staff, {
        id: "chuong-pub-1",
        chapterNumber: 1,
      });

      const scheduled = await api<ChapterPublicationSchedule>(
        "PUT",
        schedulePath("chuong-pub-1"),
        { headers: staff.publisher, body: { scheduledFor: LONG_AFTER } },
      );
      assert.equal(scheduled.status, 200);
      assert.equal(scheduled.body.scheduledFor, LONG_AFTER);

      const early = await api<{ error: string }>(
        "POST",
        publicationPath("chuong-pub-1"),
        { headers: staff.publisher },
      );

      assert.equal(early.status, 409);
      assert.equal(early.body.error, "publication-not-due");
    });
  });

  it("publishes a scheduled Chapter once its time has come", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await approvedChapter(api, staff, {
        id: "chuong-pub-1",
        chapterNumber: 1,
      });
      await api("PUT", schedulePath("chuong-pub-1"), {
        headers: staff.publisher,
        body: { scheduledFor: LONG_AGO },
      });

      const published = await api<PublishedSnapshot>(
        "POST",
        publicationPath("chuong-pub-1"),
        { headers: staff.publisher },
      );

      assert.equal(published.status, 201);
    });
  });

  it("refuses to schedule a Chapter nobody has approved", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await gatedChapter(api, staff, { id: "chuong-pub-1", chapterNumber: 1 });

      const scheduled = await api<{ error: string }>(
        "PUT",
        schedulePath("chuong-pub-1"),
        { headers: staff.publisher, body: { scheduledFor: LONG_AFTER } },
      );

      assert.equal(scheduled.status, 409);
      assert.equal(scheduled.body.error, "human-approval-required");
    });
  });

  it("refuses a schedule that names no time", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await approvedChapter(api, staff, {
        id: "chuong-pub-1",
        chapterNumber: 1,
      });

      const scheduled = await api("PUT", schedulePath("chuong-pub-1"), {
        headers: staff.publisher,
        body: {},
      });

      assert.equal(scheduled.status, 400);
    });
  });
});

describe("approving a Chapter", () => {
  it("refuses a draft the Quality Gate blocked for a reason approval cannot answer", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await gatedChapter(
        api,
        staff,
        { id: "chuong-pub-1", chapterNumber: 1 },
        reportedChecks.map((check) =>
          check.condition === "policySafety"
            ? { ...check, verdict: "blocking-failure" as const }
            : check,
        ),
      );

      const approved = await api<{ error: string }>(
        "POST",
        approvalPath("chuong-pub-1"),
        { headers: staff.reviewer },
      );

      assert.equal(approved.status, 409);
      assert.equal(approved.body.error, "quality-gate-blocked");
    });
  });

  it("refuses a draft the Quality Gate has not run on", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await authorDraft(api, staff, { id: "chuong-pub-1", chapterNumber: 1 });

      const approved = await api<{ error: string }>(
        "POST",
        approvalPath("chuong-pub-1"),
        { headers: staff.reviewer },
      );

      assert.equal(approved.status, 409);
      assert.equal(approved.body.error, "quality-gate-blocked");
    });
  });

  it("answers as unknown for a draft Chapter the Series does not hold", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);

      const approved = await api("POST", approvalPath("chuong-pub-9"), {
        headers: staff.reviewer,
      });

      assert.equal(approved.status, 404);
    });
  });
});

describe("who may approve and who may publish", () => {
  it("keeps writing a Chapter, approving it, and publishing it apart", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await gatedChapter(api, staff, { id: "chuong-pub-1", chapterNumber: 1 });

      const approvedByEditor = await api("POST", approvalPath("chuong-pub-1"), {
        headers: staff.editor,
      });
      assert.equal(approvedByEditor.status, 403);

      await api("POST", approvalPath("chuong-pub-1"), {
        headers: staff.reviewer,
      });

      const publishedByReviewer = await api(
        "POST",
        publicationPath("chuong-pub-1"),
        {
          headers: staff.reviewer,
        },
      );
      assert.equal(publishedByReviewer.status, 403);
    });
  });

  it("refuses a reader session and an unidentified request alike", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await approvedChapter(api, staff, {
        id: "chuong-pub-1",
        chapterNumber: 1,
      });

      for (const headers of [readerHeaders(), {}]) {
        for (const path of [
          approvalPath("chuong-pub-1"),
          publicationPath("chuong-pub-1"),
        ]) {
          const refused = await api("POST", path, { headers });

          assert.equal(refused.status, 401);
        }
      }
    });
  });
});

describe("what approving and publishing leave behind", () => {
  it("appends the approval and the publication to the Provenance Ledger", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await approvedChapter(api, staff, {
        id: "chuong-pub-1",
        chapterNumber: 1,
      });
      await api("POST", publicationPath("chuong-pub-1"), {
        headers: staff.publisher,
      });

      const lineage = await seriesLineage(api, staff.editor);
      const approval = lineage.find(
        (entry) => entry.action === "chapter-draft.approve",
      );
      const publication = lineage.find(
        (entry) => entry.action === "published-snapshot.publish",
      );

      assert.deepEqual(approval?.source, {
        kind: "staff",
        staffAccountId: "staff-reviewer-1",
      });
      assert.deepEqual(publication?.source, {
        kind: "staff",
        staffAccountId: "staff-publisher-1",
      });
      assert.equal(publication?.target.kind, "published-snapshot");
      assert.deepEqual(
        publication?.version.kind === "published-snapshot"
          ? [publication.version.chapterId, publication.version.version]
          : undefined,
        ["chuong-pub-1", 1],
      );
    });
  });

  /**
   * Scheduling changes no content, so it leaves the Staff Audit Record and not
   * the Provenance Ledger: an intention is an operation, not lineage.
   */
  it("audits a schedule without calling it lineage", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await approvedChapter(api, staff, {
        id: "chuong-pub-1",
        chapterNumber: 1,
      });
      await api("PUT", schedulePath("chuong-pub-1"), {
        headers: staff.publisher,
        body: { scheduledFor: LONG_AFTER },
      });

      const lineage = await seriesLineage(api, staff.editor);
      assert.equal(
        lineage.some((entry) => entry.action.includes("schedule")),
        false,
      );

      const auditLog = await api<{
        records: { action: string; outcome: string; target: string }[];
      }>("GET", "/staff/audit-log", { headers: staff.editor });
      const scheduled = auditLog.body.records.filter(
        (record) => record.action === "staff.chapter-publication.schedule",
      );

      assert.deepEqual(
        scheduled.map((record) => record.outcome),
        ["allowed"],
      );
      assert.deepEqual(
        scheduled.map((record) => record.target),
        ["chapter-draft:chuong-pub-1"],
      );
    });
  });
});

describe("revising a published Chapter", () => {
  /**
   * The whole point of ADR-0003: a fix is a further version, and the version
   * readers actually saw is still there afterwards, word for word.
   */
  it("publishes a further version and keeps what readers saw on the record", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);
      const first = await publicationRecord(api, staff);
      await rewriteAndReapprove(api, staff);

      const revised = await api<PublishedSnapshot>(
        "POST",
        revisionPath("chuong-pub-1"),
        { headers: staff.publisher, body: { reason: FIX_REASON } },
      );

      assert.equal(revised.status, 201, JSON.stringify(revised.body));
      assert.equal(revised.body.version, 2);
      assert.equal(revised.body.body, FIXED_BODY);
      assert.deepEqual(revised.body.revision, {
        supersedesSnapshotId: first.versions[0]?.id,
        reason: FIX_REASON,
      });

      const record = await publicationRecord(api, staff);
      assert.deepEqual(
        record.versions.map((version) => version.version),
        [2, 1],
      );
      assert.equal(record.versions[1]?.body, ORIGINAL_BODY);
      assert.equal(record.versions[1]?.id, first.versions[0]?.id);

      const read = await api<{ body: string; version: number }>(
        "GET",
        publicChapterPath("chuong-pub-1"),
      );
      assert.equal(read.body.version, 2);
      assert.equal(read.body.body, FIXED_BODY);
    });
  });

  it("refuses a fix nobody explained", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);
      await rewriteAndReapprove(api, staff);

      const silent = await api("POST", revisionPath("chuong-pub-1"), {
        headers: staff.publisher,
        body: {},
      });

      assert.equal(silent.status, 400);
    });
  });

  it("refuses a fix to a Chapter nobody published", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await approvedChapter(api, staff, {
        id: "chuong-pub-1",
        chapterNumber: 1,
      });

      const refused = await api<{ error: string }>(
        "POST",
        revisionPath("chuong-pub-1"),
        { headers: staff.publisher, body: { reason: FIX_REASON } },
      );

      assert.equal(refused.status, 409);
      assert.equal(refused.body.error, "chapter-not-published");
    });
  });

  /** A fix is new prose, so it goes back through the gate and the reviewer. */
  it("refuses a fix whose prose nobody re-approved", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);
      await api("PUT", draftPath("chuong-pub-1"), {
        headers: staff.editor,
        body: { body: FIXED_BODY },
      });

      const refused = await api<{ error: string }>(
        "POST",
        revisionPath("chuong-pub-1"),
        { headers: staff.publisher, body: { reason: FIX_REASON } },
      );

      assert.equal(refused.status, 409);
      assert.equal(refused.body.error, "quality-gate-blocked");
    });
  });

  it("refuses a fix from an account that may not publish", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);
      await rewriteAndReapprove(api, staff);

      const refused = await api("POST", revisionPath("chuong-pub-1"), {
        headers: staff.reviewer,
        body: { reason: FIX_REASON },
      });

      assert.equal(refused.status, 403);
    });
  });
});

describe("taking a published Chapter down", () => {
  it("stops distribution without deleting what was published", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);

      const takedown = await api<ChapterTakedown>(
        "POST",
        takedownPath("chuong-pub-1"),
        { headers: staff.moderator, body: { reason: TAKEDOWN_REASON } },
      );

      assert.equal(takedown.status, 201, JSON.stringify(takedown.body));
      assert.equal(takedown.body.reason, TAKEDOWN_REASON);
      assert.equal(
        takedown.body.takenDownByStaffAccountId,
        "staff-moderator-1",
      );

      const read = await api("GET", publicChapterPath("chuong-pub-1"));
      assert.equal(
        read.status,
        404,
        "readers cannot open a Chapter taken down",
      );

      const catalog = await api<PublicCatalogSeries[]>(
        "GET",
        "/catalog/series",
      );
      assert.equal(
        catalog.body.some((series) => series.id === seriesId),
        false,
        "a Series whose only Chapter is down is not in the public catalog",
      );

      const record = await publicationRecord(api, staff);
      assert.equal(record.versions.length, 1);
      assert.equal(record.versions[0]?.body, ORIGINAL_BODY);
      assert.equal(record.takedown?.snapshotId, record.versions[0]?.id);
      assert.equal(record.takedown?.reason, TAKEDOWN_REASON);
    });
  });

  /** Like an approval: a second one must not move the accountability. */
  it("keeps the Staff Account that first stopped distribution", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);
      const first = await api<ChapterTakedown>(
        "POST",
        takedownPath("chuong-pub-1"),
        { headers: staff.moderator, body: { reason: TAKEDOWN_REASON } },
      );

      const again = await api<ChapterTakedown>(
        "POST",
        takedownPath("chuong-pub-1"),
        { headers: staff.moderator, body: { reason: "một lý do khác" } },
      );

      assert.equal(again.status, 201);
      assert.deepEqual(again.body, first.body);
    });
  });

  it("refuses a takedown nobody explained, and one from an account that may only publish", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);

      const silent = await api("POST", takedownPath("chuong-pub-1"), {
        headers: staff.moderator,
        body: {},
      });
      assert.equal(silent.status, 400);

      const byPublisher = await api("POST", takedownPath("chuong-pub-1"), {
        headers: staff.publisher,
        body: { reason: TAKEDOWN_REASON },
      });
      assert.equal(byPublisher.status, 403);
    });
  });

  it("refuses a takedown of a Chapter nobody published", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await governedSeries(api, staff);
      await approvedChapter(api, staff, {
        id: "chuong-pub-1",
        chapterNumber: 1,
      });

      const refused = await api<{ error: string }>(
        "POST",
        takedownPath("chuong-pub-1"),
        { headers: staff.moderator, body: { reason: TAKEDOWN_REASON } },
      );

      assert.equal(refused.status, 409);
      assert.equal(refused.body.error, "chapter-not-published");
    });
  });

  /** Republishing would be a way around a decision somebody else took. */
  it("refuses a fix that would put a Chapter under takedown back out", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);
      await api("POST", takedownPath("chuong-pub-1"), {
        headers: staff.moderator,
        body: { reason: TAKEDOWN_REASON },
      });
      await rewriteAndReapprove(api, staff);

      const refused = await api<{ error: string }>(
        "POST",
        revisionPath("chuong-pub-1"),
        { headers: staff.publisher, body: { reason: FIX_REASON } },
      );

      assert.equal(refused.status, 409);
      assert.equal(refused.body.error, "chapter-under-takedown");
    });
  });

  /**
   * Sequence is a fact about what the Series has published, not about what it
   * is currently distributing, so taking Chapter 1 down does not freeze the
   * Series behind it.
   */
  it("leaves the Series able to publish the Chapter after one taken down", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);
      await approvedChapter(api, staff, {
        id: "chuong-pub-2",
        chapterNumber: 2,
      });
      await api("POST", takedownPath("chuong-pub-1"), {
        headers: staff.moderator,
        body: { reason: TAKEDOWN_REASON },
      });

      const published = await api<PublishedSnapshot>(
        "POST",
        publicationPath("chuong-pub-2"),
        { headers: staff.publisher },
      );

      assert.equal(published.status, 201, JSON.stringify(published.body));
      assert.equal(published.body.chapterNumber, 2);
    });
  });
});

describe("what revising and taking down leave behind", () => {
  it("appends both to the Provenance Ledger and keeps the reason in the audit trail", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);
      await rewriteAndReapprove(api, staff);
      await api("POST", revisionPath("chuong-pub-1"), {
        headers: staff.publisher,
        body: { reason: FIX_REASON },
      });
      await api("POST", takedownPath("chuong-pub-1"), {
        headers: staff.moderator,
        body: { reason: TAKEDOWN_REASON },
      });

      const lineage = await seriesLineage(api, staff.editor);
      const revision = lineage.find(
        (entry) => entry.action === "published-snapshot.revise",
      );
      const takedown = lineage.find(
        (entry) => entry.action === "published-snapshot.takedown",
      );

      assert.deepEqual(revision?.source, {
        kind: "staff",
        staffAccountId: "staff-publisher-1",
      });
      assert.deepEqual(
        revision?.version.kind === "published-snapshot"
          ? [revision.version.chapterId, revision.version.version]
          : undefined,
        ["chuong-pub-1", 2],
      );
      assert.deepEqual(takedown?.source, {
        kind: "staff",
        staffAccountId: "staff-moderator-1",
      });

      const auditLog = await api<{
        records: { action: string; reason?: string }[];
      }>("GET", "/staff/audit-log", { headers: staff.editor });
      const reasons = auditLog.body.records
        .filter((record) =>
          [
            "staff.published-chapter.revise",
            "staff.published-chapter.takedown",
          ].includes(record.action),
        )
        .map((record) => record.reason);

      assert.deepEqual(reasons.sort(), [FIX_REASON, TAKEDOWN_REASON].sort());
    });
  });
});

type StaffSessions = {
  editor: Record<string, string>;
  reviewer: Record<string, string>;
  publisher: Record<string, string>;
  moderator: Record<string, string>;
};

type PublicationRecord = {
  chapterId: string;
  versions: PublishedSnapshot[];
  takedown?: ChapterTakedown;
};

type ChapterFixture = { id: string; chapterNumber: number };

/** A governed Series with a Story Bible and a Rights Record on file. */
async function governedSeries(
  api: ApiClient,
  staff: StaffSessions,
): Promise<void> {
  await api("POST", "/staff/series", {
    headers: staff.editor,
    body: seriesBody,
  });
  await api("PUT", `/staff/series/${seriesId}/story-bible`, {
    headers: staff.editor,
    body: { canon: [{ id: "canon-1", statement: "Mưa Ngâu rơi tháng bảy." }] },
  });
  await api("POST", "/staff/rights-records", {
    headers: staff.editor,
    body: rightsRecordBody,
  });
}

async function authorDraft(
  api: ApiClient,
  staff: StaffSessions,
  chapter: ChapterFixture,
): Promise<ChapterDraft> {
  const authored = await api<ChapterDraft>(
    "POST",
    `/staff/series/${seriesId}/chapters`,
    {
      headers: staff.editor,
      body: {
        id: chapter.id,
        chapterNumber: chapter.chapterNumber,
        title: `Mùi Mưa Thứ ${chapter.chapterNumber}`,
        body: ORIGINAL_BODY,
      },
    },
  );

  assert.equal(authored.status, 201, JSON.stringify(authored.body));

  return authored.body;
}

/** A draft with cleared material and a Quality Gate run over all of it. */
async function gatedChapter(
  api: ApiClient,
  staff: StaffSessions,
  chapter: ChapterFixture,
  checks: readonly ReportedQualityCheck[] = reportedChecks,
): Promise<void> {
  await authorDraft(api, staff, chapter);
  await api(
    "POST",
    `/staff/series/${seriesId}/chapters/${chapter.id}/materials`,
    {
      headers: staff.editor,
      body: { material, use: "publishing", territory: "VN" },
    },
  );
  const run = await api(
    "POST",
    `/staff/series/${seriesId}/chapters/${chapter.id}/quality-gate`,
    { headers: staff.editor, body: { reportedChecks: checks } },
  );

  assert.equal(run.status, 201, JSON.stringify(run.body));
}

/** A Chapter readers can already open, which is where a fix starts. */
async function publishedChapter(
  api: ApiClient,
  staff: StaffSessions,
): Promise<void> {
  await governedSeries(api, staff);
  await approvedChapter(api, staff, { id: "chuong-pub-1", chapterNumber: 1 });
  const published = await api("POST", publicationPath("chuong-pub-1"), {
    headers: staff.publisher,
  });

  assert.equal(published.status, 201, JSON.stringify(published.body));
}

/**
 * A post-publication fix as an editorial team makes one: the prose is
 * rewritten, which costs the draft its gate result and its approval, so both
 * are earned again before the fix reaches the publishing door.
 */
async function rewriteAndReapprove(
  api: ApiClient,
  staff: StaffSessions,
): Promise<void> {
  const rewritten = await api<ChapterDraft>("PUT", draftPath("chuong-pub-1"), {
    headers: staff.editor,
    body: { body: FIXED_BODY },
  });
  assert.equal(rewritten.status, 200, JSON.stringify(rewritten.body));
  assert.equal(rewritten.body.qualityGate, undefined);
  assert.equal(rewritten.body.humanApproval, undefined);

  const run = await api(
    "POST",
    `/staff/series/${seriesId}/chapters/chuong-pub-1/quality-gate`,
    { headers: staff.editor, body: { reportedChecks } },
  );
  assert.equal(run.status, 201, JSON.stringify(run.body));

  const approved = await api("POST", approvalPath("chuong-pub-1"), {
    headers: staff.reviewer,
  });
  assert.equal(approved.status, 201, JSON.stringify(approved.body));
}

/** Everything NovelX has published of one Chapter, and whether it is down. */
async function publicationRecord(
  api: ApiClient,
  staff: StaffSessions,
): Promise<PublicationRecord> {
  const read = await api<PublicationRecord>(
    "GET",
    publicationPath("chuong-pub-1"),
    { headers: staff.publisher },
  );

  assert.equal(read.status, 200, JSON.stringify(read.body));

  return read.body;
}

/** The same draft, with an accountable reviewer's approval on it. */
async function approvedChapter(
  api: ApiClient,
  staff: StaffSessions,
  chapter: ChapterFixture,
): Promise<void> {
  await gatedChapter(api, staff, chapter);
  const approved = await api("POST", approvalPath(chapter.id), {
    headers: staff.reviewer,
  });

  assert.equal(approved.status, 201, JSON.stringify(approved.body));
}

/** Everything the ledger holds for the Series, oldest entry first. */
async function seriesLineage(
  api: ApiClient,
  headers: Record<string, string>,
): Promise<ProvenanceEntry[]> {
  const read = await api<{ entries: ProvenanceEntry[] }>(
    "GET",
    `/staff/series/${seriesId}/provenance`,
    { headers },
  );

  assert.equal(read.status, 200, JSON.stringify(read.body));

  return [...read.body.entries].reverse();
}

function approvalPath(chapterId: string): string {
  return `/staff/series/${seriesId}/chapters/${chapterId}/approval`;
}

function schedulePath(chapterId: string): string {
  return `/staff/series/${seriesId}/chapters/${chapterId}/schedule`;
}

function publicationPath(chapterId: string): string {
  return `/staff/series/${seriesId}/chapters/${chapterId}/publication`;
}

function revisionPath(chapterId: string): string {
  return `/staff/series/${seriesId}/chapters/${chapterId}/revision`;
}

function takedownPath(chapterId: string): string {
  return `/staff/series/${seriesId}/chapters/${chapterId}/takedown`;
}

function draftPath(chapterId: string): string {
  return `/staff/series/${seriesId}/chapters/${chapterId}`;
}

function publicChapterPath(chapterId: string): string {
  return `/catalog/series/${seriesId}/chapters/${chapterId}`;
}

async function staffSessions(api: ApiClient): Promise<StaffSessions> {
  const [editor, reviewer, publisher, moderator] = await Promise.all([
    staffHeaders(api, "staff-editor-1", editorCredential),
    staffHeaders(api, "staff-reviewer-1", reviewerCredential),
    staffHeaders(api, "staff-publisher-1", publisherCredential),
    staffHeaders(api, "staff-moderator-1", moderatorCredential),
  ]);

  return { editor, reviewer, publisher, moderator };
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

function readerHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${signReaderSessionToken({
      principal: createReaderPrincipal({ readerAccountId: "reader-1" }),
      secret: readerSecret,
      issuedAt: "2026-08-01T08:00:00.000Z",
    })}`,
  };
}
