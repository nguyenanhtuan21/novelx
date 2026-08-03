import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createReaderPrincipal,
  type EntitlementRequirement,
  type ManagedTaxonomy,
  type PublicChapter,
  type ReportedQualityCheck,
} from "@novelx/shared";

import { restoreEnv, withApi, type ApiClient } from "./api-test-client.js";
import { signReaderSessionToken } from "./reader-session-token.js";

const editorCredential = "staff-editor-ent-access-credential";
const publisherCredential = "staff-publisher-ent-access-credential";
const entitlementsCredential = "staff-entitlements-access-credential";
const reviewerCredential = "staff-reviewer-ent-access-credential";
const readerSecret = "reader-session-secret-for-entitlement-tests";

/**
 * The accounts Entitlement-ready access needs: an editor to write the governed
 * Chapter, a reviewer and publisher to bring it public, and an entitlements
 * admin who may mark a requirement and grant a reader the benefit that satisfies
 * it. No account here holds a permission it does not need.
 */
const staffAccounts = JSON.stringify([
  {
    id: "staff-editor-ent",
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
    id: "staff-reviewer-ent",
    permissions: ["series:read", "chapter:approve"],
    credentialSha256: createHash("sha256")
      .update(reviewerCredential)
      .digest("hex"),
  },
  {
    id: "staff-publisher-ent",
    permissions: ["series:read", "chapter:publish"],
    credentialSha256: createHash("sha256")
      .update(publisherCredential)
      .digest("hex"),
  },
  {
    id: "staff-entitlements-ent",
    permissions: ["series:read", "entitlement:write"],
    credentialSha256: createHash("sha256")
      .update(entitlementsCredential)
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

const seriesId = "series-entitlement-1";
const seriesBody = {
  id: seriesId,
  title: "Thanh Kiếm Trong Mưa",
  synopsis: "Một series tiên hiệp trong catalog tuyển chọn của NovelX.",
  creativeDisclosure: "Hybrid",
  taxonomy,
};

const material = {
  id: "source-outline-entitlement-1",
  kind: "source-material",
};

const rightsRecordBody = {
  id: "rights-entitlement-1",
  material,
  owner: "NovelX Editorial",
  scope: ["publishing"],
  territories: ["VN"],
  duration: { from: "2026-01-01T00:00:00.000Z" },
  modificationAllowed: true,
  aiUseAllowed: false,
  evidence: { kind: "work-for-hire", reference: "contract-ent-2026-1" },
};

const reportedChecks: readonly ReportedQualityCheck[] = [
  { condition: "canonContinuity", verdict: "pass", score: 96 },
  { condition: "policySafety", verdict: "pass", score: 99 },
  { condition: "originalityIp", verdict: "pass", score: 97 },
  { condition: "metadata", verdict: "pass", score: 100 },
];

const gatedChapterId = "chuong-ent-1";

beforeEach(() => {
  delete process.env.DATABASE_URL;
  process.env.STAFF_ACCOUNTS = staffAccounts;
  process.env.STAFF_SESSION_SECRET =
    "staff-session-secret-for-entitlement-tests";
  process.env.READER_SESSION_SECRET = readerSecret;
});

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    restoreEnv(name, value);
  }
});

describe("marking a Chapter as requiring an Entitlement", () => {
  it("records the benefit a Chapter demands before a reader may open it", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);

      const marked = await api<EntitlementRequirement>(
        "PUT",
        requirementPath(gatedChapterId),
        { headers: staff.entitlements, body: { benefit: "early-access" } },
      );

      assert.equal(marked.status, 200);
      assert.deepEqual(marked.body, {
        chapterId: gatedChapterId,
        benefit: "early-access",
      });
    });
  });

  it("refuses a benefit NovelX does not model", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);

      const refused = await api<{ error: string }>(
        "PUT",
        requirementPath(gatedChapterId),
        { headers: staff.entitlements, body: { benefit: "vip-only" } },
      );

      assert.equal(refused.status, 400);
    });
  });

  it("refuses an account that may not manage entitlements", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);

      const refused = await api("PUT", requirementPath(gatedChapterId), {
        headers: staff.publisher,
        body: { benefit: "early-access" },
      });

      assert.equal(refused.status, 403);
    });
  });

  it("refuses a reader session and an unidentified request alike", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);

      for (const headers of [readerHeaders(), {}]) {
        const refused = await api("PUT", requirementPath(gatedChapterId), {
          headers,
          body: { benefit: "early-access" },
        });

        assert.equal(refused.status, 401);
      }
    });
  });
});

describe("Entitlement-ready reader access", () => {
  it("keeps a Chapter open to every reader until one demands a benefit", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);

      const open = await api<PublicChapter>(
        "GET",
        publicChapterPath(gatedChapterId),
      );

      assert.equal(open.status, 200);
      assert.equal(open.body.chapterId, gatedChapterId);
    });
  });

  it("blocks a reader who holds no Entitlement with an upgrade-ready state", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);
      await markRequirement(api, staff);

      const blocked = await api<{
        error: string;
        benefit: string;
        contentId: string;
        upgradePath: string;
      }>("GET", publicChapterPath(gatedChapterId));

      assert.equal(blocked.status, 402);
      assert.equal(blocked.body.error, "entitlement-required");
      assert.equal(blocked.body.benefit, "early-access");
      assert.equal(blocked.body.contentId, gatedChapterId);
      assert.equal(blocked.body.upgradePath, "/reader/accounts");
    });
  });

  it("blocks an anonymous reader the same way it blocks an unknown one", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);
      await markRequirement(api, staff);

      const anonymousSession = await api<{ token: string }>(
        "POST",
        "/reader/sessions",
      );

      const blocked = await api<{ error: string }>(
        "GET",
        publicChapterPath(gatedChapterId),
        { headers: { authorization: `Bearer ${anonymousSession.body.token}` } },
      );

      assert.equal(blocked.status, 402);
      assert.equal(blocked.body.error, "entitlement-required");
    });
  });

  it("grants a reader who holds the Entitlement the Chapter demands", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);
      await markRequirement(api, staff);

      const reader = await readerAccount(api);

      const before = await api("GET", publicChapterPath(gatedChapterId), {
        headers: reader.headers,
      });
      assert.equal(before.status, 402);

      const granted = await api<{ contentId: string; benefit: string }>(
        "POST",
        `/staff/reader-accounts/${reader.readerAccountId}/entitlements`,
        {
          headers: staff.entitlements,
          body: { contentId: gatedChapterId, benefit: "early-access" },
        },
      );
      assert.equal(granted.status, 201);
      assert.deepEqual(granted.body, {
        contentId: gatedChapterId,
        benefit: "early-access",
      });

      const after = await api<PublicChapter>(
        "GET",
        publicChapterPath(gatedChapterId),
        { headers: reader.headers },
      );

      assert.equal(after.status, 200);
      assert.equal(after.body.chapterId, gatedChapterId);
      assert.equal(after.body.title, "Mùi Mưa Đầu Tiên");
    });
  });

  it("does not let an ad-free Entitlement satisfy an early-access demand", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);
      await markRequirement(api, staff);

      const reader = await readerAccount(api);
      await api(
        "POST",
        `/staff/reader-accounts/${reader.readerAccountId}/entitlements`,
        {
          headers: staff.entitlements,
          body: { contentId: gatedChapterId, benefit: "ad-free" },
        },
      );

      const blocked = await api("GET", publicChapterPath(gatedChapterId), {
        headers: reader.headers,
      });

      assert.equal(blocked.status, 402);
    });
  });

  it("refuses a grant from an account that may not manage entitlements", async () => {
    await withApi(async (api) => {
      const staff = await staffSessions(api);
      await publishedChapter(api, staff);
      await markRequirement(api, staff);

      const reader = await readerAccount(api);

      const refused = await api(
        "POST",
        `/staff/reader-accounts/${reader.readerAccountId}/entitlements`,
        {
          headers: staff.publisher,
          body: { contentId: gatedChapterId, benefit: "early-access" },
        },
      );

      assert.equal(refused.status, 403);
    });
  });
});

type StaffSessions = {
  editor: Record<string, string>;
  reviewer: Record<string, string>;
  publisher: Record<string, string>;
  entitlements: Record<string, string>;
};

async function publishedChapter(
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
  await api("POST", `/staff/series/${seriesId}/chapters`, {
    headers: staff.editor,
    body: {
      id: gatedChapterId,
      chapterNumber: 1,
      title: "Mùi Mưa Đầu Tiên",
      body: "Mưa rơi trên mái ngõ, và một lời thề cũ được nhắc lại.",
    },
  });
  await api(
    "POST",
    `/staff/series/${seriesId}/chapters/${gatedChapterId}/materials`,
    {
      headers: staff.editor,
      body: { material, use: "publishing", territory: "VN" },
    },
  );
  await api(
    "POST",
    `/staff/series/${seriesId}/chapters/${gatedChapterId}/quality-gate`,
    { headers: staff.editor, body: { reportedChecks } },
  );
  await api("POST", approvalPath(gatedChapterId), { headers: staff.reviewer });
  const published = await api("POST", publicationPath(gatedChapterId), {
    headers: staff.publisher,
  });
  assert.equal(published.status, 201, JSON.stringify(published.body));
}

async function markRequirement(
  api: ApiClient,
  staff: StaffSessions,
): Promise<void> {
  const marked = await api("PUT", requirementPath(gatedChapterId), {
    headers: staff.entitlements,
    body: { benefit: "early-access" },
  });
  assert.equal(marked.status, 200, JSON.stringify(marked.body));
}

async function readerAccount(
  api: ApiClient,
): Promise<{ readerAccountId: string; headers: Record<string, string> }> {
  const session = await api<{ token: string }>("POST", "/reader/sessions");
  const upgraded = await api<{ readerAccountId: string; token: string }>(
    "POST",
    "/reader/accounts",
    { headers: { authorization: `Bearer ${session.body.token}` } },
  );
  assert.equal(upgraded.status, 201, JSON.stringify(upgraded.body));

  return {
    readerAccountId: upgraded.body.readerAccountId,
    headers: { authorization: `Bearer ${upgraded.body.token}` },
  };
}

function approvalPath(chapterId: string): string {
  return `/staff/series/${seriesId}/chapters/${chapterId}/approval`;
}

function publicationPath(chapterId: string): string {
  return `/staff/series/${seriesId}/chapters/${chapterId}/publication`;
}

function requirementPath(chapterId: string): string {
  return `/staff/series/${seriesId}/chapters/${chapterId}/entitlement`;
}

function publicChapterPath(chapterId: string): string {
  return `/catalog/series/${seriesId}/chapters/${chapterId}`;
}

async function staffSessions(api: ApiClient): Promise<StaffSessions> {
  const [editor, reviewer, publisher, entitlements] = await Promise.all([
    staffHeaders(api, "staff-editor-ent", editorCredential),
    staffHeaders(api, "staff-reviewer-ent", reviewerCredential),
    staffHeaders(api, "staff-publisher-ent", publisherCredential),
    staffHeaders(api, "staff-entitlements-ent", entitlementsCredential),
  ]);

  return { editor, reviewer, publisher, entitlements };
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
