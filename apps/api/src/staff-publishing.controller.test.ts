import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createReaderPrincipal,
  type ChapterDraft,
  type ChapterPublicationSchedule,
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
const readerSecret = "reader-session-secret-for-tests";

/**
 * Three Staff Accounts, because publishing is where the separations matter:
 * writing the prose, taking accountability for it, and putting it in front of
 * readers are three authorities, and no account here holds two of them.
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
      assert.equal(published.body.publiclyReadable, true);
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

type StaffSessions = {
  editor: Record<string, string>;
  reviewer: Record<string, string>;
  publisher: Record<string, string>;
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
        body: "Mưa rơi trên mái ngõ, và một lời thề cũ được nhắc lại.",
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

async function staffSessions(api: ApiClient): Promise<StaffSessions> {
  const [editor, reviewer, publisher] = await Promise.all([
    staffHeaders(api, "staff-editor-1", editorCredential),
    staffHeaders(api, "staff-reviewer-1", reviewerCredential),
    staffHeaders(api, "staff-publisher-1", publisherCredential),
  ]);

  return { editor, reviewer, publisher };
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
