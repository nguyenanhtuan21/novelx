import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createReaderPrincipal,
  type ChapterDraft,
  type ManagedTaxonomy,
  type RightsRecord,
  type StaffAuditRecord,
  type UnbackedRightsClaim,
} from "@novelx/shared";

import { restoreEnv, withApi, type ApiClient } from "./api-test-client.js";
import { signReaderSessionToken } from "./reader-session-token.js";

const editorCredential = "staff-editor-1-access-credential";
const moderatorCredential = "staff-moderator-1-access-credential";
const readerSecret = "reader-session-secret-for-tests";

const staffAccounts = JSON.stringify([
  {
    id: "staff-editor-1",
    permissions: [
      "series:write",
      "series:read",
      "canon:write",
      "chapter:write",
      "rights:write",
      "rights:read",
      "audit:read",
    ],
    credentialSha256: createHash("sha256")
      .update(editorCredential)
      .digest("hex"),
  },
  {
    id: "staff-moderator-1",
    permissions: ["series:takedown", "audit:read"],
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

const seriesBody = {
  id: "series-cms-1",
  title: "Thanh Kiếm Trong Mưa",
  synopsis: "Một series tiên hiệp trong catalog tuyển chọn của NovelX.",
  creativeDisclosure: "Hybrid",
  taxonomy,
};

const material = { id: "asset-cover-illustration-1", kind: "asset" };

const rightsRecordBody = {
  id: "rights-1",
  material,
  owner: "Studio Mưa Ngâu",
  scope: ["ai-workflow", "publishing"],
  territories: ["VN"],
  duration: { from: "2026-01-01T00:00:00.000Z" },
  modificationAllowed: true,
  aiUseAllowed: true,
  evidence: { kind: "signed-licence", reference: "contract-2026-014" },
};

const attachAiUse = {
  material,
  use: "ai-workflow",
  territory: "VN",
};

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

describe("recording a Rights Record", () => {
  it("keeps the grant an accountable editor entered, and reads it back", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);

      const recorded = await api<RightsRecord>(
        "POST",
        "/staff/rights-records",
        { headers, body: rightsRecordBody },
      );
      assert.equal(recorded.status, 201);
      assert.equal(recorded.body.owner, "Studio Mưa Ngâu");
      assert.equal(recorded.body.recordedByStaffAccountId, "staff-editor-1");
      assert.ok(Date.parse(recorded.body.recordedAt) > 0);

      const read = await api<RightsRecord>(
        "GET",
        "/staff/rights-records/rights-1",
        { headers },
      );
      assert.equal(read.status, 200);
      assert.deepEqual(read.body.material, material);
      assert.deepEqual(read.body.scope, ["ai-workflow", "publishing"]);
      assert.deepEqual(read.body.evidence, rightsRecordBody.evidence);
    });
  });

  it("refuses being reachable on the Internet as evidence of a grant", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      const unbacked: UnbackedRightsClaim[] = [
        "public-availability",
        "source-url",
      ];

      for (const kind of unbacked) {
        const refused = await api<{ error: string }>(
          "POST",
          "/staff/rights-records",
          {
            headers,
            body: {
              ...rightsRecordBody,
              evidence: {
                kind,
                reference: "https://example.invalid/illustration.png",
              },
            },
          },
        );

        assert.equal(refused.status, 400, kind);
        assert.equal(refused.body.error, "rights-evidence-required", kind);
      }

      const missing = await api("GET", "/staff/rights-records/rights-1", {
        headers,
      });
      assert.equal(missing.status, 404);
    });
  });

  it("refuses a grant that leaves what was granted unsaid", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);

      for (const incomplete of [
        { owner: undefined },
        { scope: undefined },
        { territories: undefined },
        { duration: undefined },
        { material: undefined },
      ]) {
        const refused = await api("POST", "/staff/rights-records", {
          headers,
          body: { ...rightsRecordBody, ...incomplete },
        });

        assert.equal(refused.status, 400, JSON.stringify(incomplete));
      }
    });
  });

  /**
   * A grant a past workflow relied on is evidence, so a second record claiming
   * the same id is refused rather than allowed to overwrite what it says.
   */
  it("refuses a second Rights Record claiming an id already held", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await api("POST", "/staff/rights-records", {
        headers,
        body: rightsRecordBody,
      });

      const duplicate = await api("POST", "/staff/rights-records", {
        headers,
        body: { ...rightsRecordBody, owner: "Somebody Else" },
      });
      assert.equal(duplicate.status, 409);

      const held = await api<RightsRecord>(
        "GET",
        "/staff/rights-records/rights-1",
        { headers },
      );
      assert.equal(held.body.owner, "Studio Mưa Ngâu");
    });
  });

  it("refuses a reader session and a Staff Account without rights:write", async () => {
    await withApi(async (api) => {
      const attempts: Array<[string, Record<string, string>, number]> = [
        ["reader", readerHeaders(), 401],
        ["moderator", await moderatorHeaders(api), 403],
      ];

      for (const [name, headers, status] of attempts) {
        const refused = await api<{ error: string }>(
          "POST",
          "/staff/rights-records",
          { headers, body: rightsRecordBody },
        );

        assert.equal(refused.status, status, name);
        assert.equal(refused.body.error, "staff-access-required", name);
      }

      const records = await staffAuditLog(api, await editorHeaders(api));
      const refusals = records
        .filter((record) => record.outcome === "denied")
        .map((record) => [record.action, record.target]);

      assert.deepEqual(refusals, [
        ["staff.rights-record.create", "rights-record:rights-1"],
        ["staff.rights-record.create", "rights-record:rights-1"],
      ]);
    });
  });
});

describe("workflow material without a Rights Record", () => {
  it("is refused before it reaches an AI or publishing workflow", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await draftChapter(api, headers);

      for (const use of ["ai-workflow", "publishing"]) {
        const refused = await api<{ error: string }>(
          "POST",
          "/staff/series/series-cms-1/chapters/chuong-1/materials",
          { headers, body: { ...attachAiUse, use } },
        );

        assert.equal(refused.status, 409, use);
        assert.equal(refused.body.error, "rights-record-required", use);
      }

      assert.deepEqual(await workflowMaterials(api, headers), []);
    });
  });

  it("is refused when the grant on record covers another material", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await draftChapter(api, headers);
      await api("POST", "/staff/rights-records", {
        headers,
        body: {
          ...rightsRecordBody,
          material: { id: "asset-other-1", kind: "asset" },
        },
      });

      const refused = await api<{ error: string }>(
        "POST",
        "/staff/series/series-cms-1/chapters/chuong-1/materials",
        { headers, body: attachAiUse },
      );

      assert.equal(refused.status, 409);
      assert.equal(refused.body.error, "rights-record-required");
    });
  });
});

describe("workflow material a Rights Record covers", () => {
  it("enters the workflow naming the Rights Record that cleared it", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await draftChapter(api, headers);
      await api("POST", "/staff/rights-records", {
        headers,
        body: rightsRecordBody,
      });

      const attached = await api<ChapterDraft>(
        "POST",
        "/staff/series/series-cms-1/chapters/chuong-1/materials",
        { headers, body: attachAiUse },
      );
      assert.equal(attached.status, 201);
      assert.deepEqual(
        attached.body.workflowMaterials?.at(0)?.material,
        material,
      );
      assert.equal(
        attached.body.workflowMaterials?.at(0)?.rightsRecordId,
        "rights-1",
      );

      assert.deepEqual(
        (await workflowMaterials(api, headers)).map((entry) => entry.use),
        ["ai-workflow"],
      );
    });
  });

  it("is refused for a use the grant does not cover", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await draftChapter(api, headers);
      await api("POST", "/staff/rights-records", {
        headers,
        body: {
          ...rightsRecordBody,
          scope: ["publishing"],
          aiUseAllowed: false,
        },
      });

      const refused = await api<{ error: string; rightsRecordId: string }>(
        "POST",
        "/staff/series/series-cms-1/chapters/chuong-1/materials",
        { headers, body: attachAiUse },
      );

      assert.equal(refused.status, 409);
      assert.equal(refused.body.error, "rights-grant-exceeded");
      assert.equal(refused.body.rightsRecordId, "rights-1");
      assert.deepEqual(await workflowMaterials(api, headers), []);
    });
  });

  it("is refused for modification the grant does not allow", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await draftChapter(api, headers);
      await api("POST", "/staff/rights-records", {
        headers,
        body: { ...rightsRecordBody, modificationAllowed: false },
      });

      const refused = await api<{ error: string }>(
        "POST",
        "/staff/series/series-cms-1/chapters/chuong-1/materials",
        { headers, body: { ...attachAiUse, modifies: true } },
      );

      assert.equal(refused.status, 409);
      assert.equal(refused.body.error, "rights-grant-exceeded");
    });
  });

  /**
   * Material is routinely licensed more than once — publishing under one
   * contract, AI use under another — so one grant refusing a use is not the
   * answer while another grant covers it.
   */
  it("is cleared by whichever of its grants covers the use", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await draftChapter(api, headers);
      await api("POST", "/staff/rights-records", {
        headers,
        body: {
          ...rightsRecordBody,
          id: "rights-publishing-1",
          scope: ["publishing"],
          aiUseAllowed: false,
        },
      });
      await api("POST", "/staff/rights-records", {
        headers,
        body: {
          ...rightsRecordBody,
          id: "rights-ai-1",
          scope: ["ai-workflow"],
        },
      });

      const attached = await api<ChapterDraft>(
        "POST",
        "/staff/series/series-cms-1/chapters/chuong-1/materials",
        { headers, body: attachAiUse },
      );

      assert.equal(attached.status, 201);
      assert.equal(
        attached.body.workflowMaterials?.at(0)?.rightsRecordId,
        "rights-ai-1",
      );
    });
  });

  /**
   * Which grant is named matters when an editor has just entered one and is
   * looking at why it did not clear the use, so the refusal reported is the
   * most recently recorded grant's rather than whichever is oldest.
   */
  it("is refused in the words of the grant most recently recorded", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await draftChapter(api, headers);
      for (const id of ["rights-older-1", "rights-newer-1"]) {
        await api("POST", "/staff/rights-records", {
          headers,
          body: {
            ...rightsRecordBody,
            id,
            scope: ["publishing"],
            aiUseAllowed: false,
          },
        });
      }

      const refused = await api<{ rightsRecordId: string }>(
        "POST",
        "/staff/series/series-cms-1/chapters/chuong-1/materials",
        { headers, body: attachAiUse },
      );

      assert.equal(refused.status, 409);
      assert.equal(refused.body.rightsRecordId, "rights-newer-1");
    });
  });

  it("refuses the same material twice for the same use", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await clearedMaterial(api, headers);

      const again = await api<{ error: string }>(
        "POST",
        "/staff/series/series-cms-1/chapters/chuong-1/materials",
        { headers, body: attachAiUse },
      );

      assert.equal(again.status, 409);
      assert.equal(again.body.error, "workflow-material-already-attached");
      assert.equal((await workflowMaterials(api, headers)).length, 1);
    });
  });

  it("refuses a body that names no material, use, or territory", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await draftChapter(api, headers);

      for (const incomplete of [
        { material: { id: "", kind: "asset" } },
        { material: { id: material.id, kind: "screenshot" } },
        { use: "training" },
        { territory: " " },
      ]) {
        const refused = await api(
          "POST",
          "/staff/series/series-cms-1/chapters/chuong-1/materials",
          { headers, body: { ...attachAiUse, ...incomplete } },
        );

        assert.equal(refused.status, 400, JSON.stringify(incomplete));
      }
    });
  });

  it("answers 404 for a draft Chapter the Series does not hold", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await draftChapter(api, headers);

      const missing = await api(
        "POST",
        "/staff/series/series-cms-1/chapters/chuong-nobody/materials",
        { headers, body: attachAiUse },
      );

      assert.equal(missing.status, 404);
    });
  });

  it("refuses a reader session and keeps the attempt", async () => {
    await withApi(async (api) => {
      const editor = await editorHeaders(api);
      await clearedMaterial(api, editor);

      const refused = await api<{ error: string }>(
        "POST",
        "/staff/series/series-cms-1/chapters/chuong-1/materials",
        {
          headers: readerHeaders(),
          body: { ...attachAiUse, use: "publishing" },
        },
      );
      assert.equal(refused.status, 401);
      assert.equal(refused.body.error, "staff-access-required");

      const records = await staffAuditLog(api, editor);
      const refusal = records.find((record) => record.outcome === "denied");

      assert.deepEqual(refusal?.actor, {
        kind: "reader",
        readerAccountId: "reader-1",
      });
      assert.equal(refusal?.action, "staff.chapter-draft.attach-material");
      assert.equal(refusal?.target, "chapter-draft:chuong-1");
    });
  });
});

/** A governed Series with one draft Chapter and nothing attached to it yet. */
async function draftChapter(
  api: ApiClient,
  headers: Record<string, string>,
): Promise<void> {
  await api("POST", "/staff/series", { headers, body: seriesBody });
  await api("POST", "/staff/series/series-cms-1/chapters", {
    headers,
    body: {
      id: "chuong-1",
      chapterNumber: 1,
      title: "Mùi Mưa Đầu Tiên",
      body: "Mưa rơi trên mái ngõ.",
    },
  });
}

/** The same draft, with the cover illustration cleared into its AI workflow. */
async function clearedMaterial(
  api: ApiClient,
  headers: Record<string, string>,
): Promise<void> {
  await draftChapter(api, headers);
  await api("POST", "/staff/rights-records", {
    headers,
    body: rightsRecordBody,
  });
  await api("POST", "/staff/series/series-cms-1/chapters/chuong-1/materials", {
    headers,
    body: attachAiUse,
  });
}

async function workflowMaterials(
  api: ApiClient,
  headers: Record<string, string>,
): Promise<NonNullable<ChapterDraft["workflowMaterials"]>> {
  const cms = await api<{ chapterDrafts: ChapterDraft[] }>(
    "GET",
    "/staff/series/series-cms-1",
    { headers },
  );

  return cms.body.chapterDrafts[0]?.workflowMaterials ?? [];
}

async function editorHeaders(api: ApiClient): Promise<Record<string, string>> {
  return staffHeaders(api, "staff-editor-1", editorCredential);
}

async function moderatorHeaders(
  api: ApiClient,
): Promise<Record<string, string>> {
  return staffHeaders(api, "staff-moderator-1", moderatorCredential);
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

async function staffAuditLog(
  api: ApiClient,
  headers: Record<string, string>,
): Promise<StaffAuditRecord[]> {
  const auditLog = await api<{ records: StaffAuditRecord[] }>(
    "GET",
    "/staff/audit-log",
    { headers },
  );

  return [...auditLog.body.records].reverse();
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
