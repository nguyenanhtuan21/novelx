import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createReaderPrincipal,
  type CanonEntry,
  type ChapterDraft,
  type ManagedTaxonomy,
  type Series,
  type StaffAuditRecord,
  type StoryBible,
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
      "provenance:read",
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

const canon: CanonEntry[] = [
  { id: "world-rule-1", statement: "Cultivation costs memory, never money." },
];

type CmsSeriesView = {
  series: Series;
  storyBible?: StoryBible;
  chapterDrafts: ChapterDraft[];
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

describe("governed Series in the staff CMS", () => {
  it("creates a Series against the Managed Taxonomy, then updates its metadata", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);

      const created = await api<Series>("POST", "/staff/series", {
        headers,
        body: seriesBody,
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.status, "draft");
      assert.deepEqual(created.body.taxonomy, taxonomy);

      const updated = await api<Series>("PUT", "/staff/series/series-cms-1", {
        headers,
        body: {
          status: "active",
          taxonomy: { ...taxonomy, tropes: ["hidden-lineage", "mentor"] },
        },
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.id, "series-cms-1");
      assert.equal(updated.body.status, "active");
      assert.equal(updated.body.title, seriesBody.title);
      assert.deepEqual(updated.body.taxonomy.tropes, [
        "hidden-lineage",
        "mentor",
      ]);
    });
  });

  it("lets staff associate a transparent AI Persona with an AI-Assisted Series", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);

      const created = await api<Series>("POST", "/staff/series", {
        headers,
        body: {
          ...seriesBody,
          creativeDisclosure: "AI-Assisted",
          aiPersona: {
            id: "persona-mua-kiem",
            displayName: "May Ke Chuyen Mua Kiem",
            disclosure: "AI-operated creative persona",
            managedContentLineIds: ["series-cms-1"],
          },
        },
      });

      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(created.body.creativeDisclosure, "AI-Assisted");
      assert.equal(created.body.aiPersona?.displayName, "May Ke Chuyen Mua Kiem");
      assert.equal(created.body.aiPersona?.canAuthenticate, false);

      const refused = await api<{ message: string }>(
        "PUT",
        "/staff/series/series-cms-1",
        {
          headers,
          body: {
            aiPersona: {
              id: "persona-fake-human",
              displayName: "Tac Gia Ao",
              disclosure: "AI-operated creative persona",
              managedContentLineIds: ["series-cms-1"],
              fakeHumanCredentials: "Award-winning human novelist",
            },
          },
        },
      );

      assert.equal(refused.status, 400);
      assert.match(refused.body.message, /AI Persona must not present fake-human/);
    });
  });

  it("refuses a Series that does not carry the Managed Taxonomy the catalog needs", async () => {
    await withApi(async (api) => {
      const refused = await api<{ message: string }>("POST", "/staff/series", {
        headers: await editorHeaders(api),
        body: { ...seriesBody, taxonomy: { ...taxonomy, ageRating: "" } },
      });

      assert.equal(refused.status, 400);
      assert.match(refused.body.message, /Managed Taxonomy requires/);
    });
  });

  /**
   * An update replaces the taxonomy rather than merging into it, so a body that
   * simply leaves contentWarnings out would take the warnings off a Series a
   * reader is about to open. That has to be refused, not accepted as empty.
   */
  it("refuses an update whose taxonomy drops the content warnings", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await api("POST", "/staff/series", { headers, body: seriesBody });

      const refused = await api<{ message: string }>(
        "PUT",
        "/staff/series/series-cms-1",
        {
          headers,
          body: {
            taxonomy: {
              genre: "fantasy",
              subgenre: "kiem-hiep",
              audience: "young-adult",
              ageRating: "13+",
            },
          },
        },
      );
      assert.equal(refused.status, 400);
      assert.match(refused.body.message, /needs tropes as a list/);

      const unchanged = await api<CmsSeriesView>(
        "GET",
        "/staff/series/series-cms-1",
        { headers },
      );
      assert.deepEqual(unchanged.body.series.taxonomy.contentWarnings, [
        "violence",
      ]);
    });
  });

  it("refuses a second Series claiming an id the CMS already holds", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await api("POST", "/staff/series", { headers, body: seriesBody });

      const duplicate = await api<{ message: string }>(
        "POST",
        "/staff/series",
        {
          headers,
          body: seriesBody,
        },
      );

      assert.equal(duplicate.status, 409);
    });
  });

  it("answers 404 for a Series the CMS does not hold", async () => {
    await withApi(async (api) => {
      const missing = await api("GET", "/staff/series/series-nobody", {
        headers: await editorHeaders(api),
      });

      assert.equal(missing.status, 404);
    });
  });
});

describe("Story Bible and Canon in the staff CMS", () => {
  it("defines Canon for a Series, then locks it with the human who did it", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await api("POST", "/staff/series", { headers, body: seriesBody });

      const defined = await api<StoryBible>(
        "PUT",
        "/staff/series/series-cms-1/story-bible",
        { headers, body: { canon } },
      );
      assert.equal(defined.status, 200);
      assert.deepEqual(defined.body.canon, canon);
      assert.equal(defined.body.lock, undefined);

      const locked = await api<StoryBible>(
        "POST",
        "/staff/series/series-cms-1/story-bible/lock",
        { headers },
      );
      assert.equal(locked.status, 201);
      assert.equal(locked.body.lock?.staffAccountId, "staff-editor-1");
      assert.ok(Date.parse(locked.body.lock?.lockedAt ?? "") > 0);
    });
  });

  it("refuses a change to locked Canon that says nothing about why", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await lockedSeries(api, headers);

      const silent = await api<{ error: string }>(
        "PUT",
        "/staff/series/series-cms-1/story-bible",
        {
          headers,
          body: {
            canon: [{ id: "world-rule-1", statement: "Anything goes." }],
          },
        },
      );

      assert.equal(silent.status, 409);
      assert.equal(silent.body.error, "canon-change-requires-reason");

      const unchanged = await api<CmsSeriesView>(
        "GET",
        "/staff/series/series-cms-1",
        { headers },
      );
      assert.deepEqual(unchanged.body.storyBible?.canon, canon);
    });
  });

  it("accepts a change to locked Canon that an accountable editor explains", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await lockedSeries(api, headers);

      const amended = await api<StoryBible>(
        "PUT",
        "/staff/series/series-cms-1/story-bible",
        {
          headers,
          body: {
            canon: [
              { id: "world-rule-1", statement: "Cultivation costs years." },
            ],
            reason: "Retcon approved by the series editorial owner",
          },
        },
      );

      assert.equal(amended.status, 200);
      assert.deepEqual(amended.body.canon, [
        { id: "world-rule-1", statement: "Cultivation costs years." },
      ]);
      assert.equal(amended.body.lock?.staffAccountId, "staff-editor-1");
    });
  });

  it("keeps the reason for a locked-Canon change in the audit trail", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await lockedSeries(api, headers);
      const reason = "Retcon approved by the series editorial owner";

      await api("PUT", "/staff/series/series-cms-1/story-bible", {
        headers,
        body: {
          canon: [
            { id: "world-rule-1", statement: "Cultivation costs years." },
          ],
          reason,
        },
      });

      const records = await staffAuditLog(api, headers);
      const explained = records.filter((record) => record.reason);

      assert.deepEqual(
        explained.map((record) => [record.action, record.reason]),
        [["staff.story-bible.amend", reason]],
      );
    });
  });

  it("refuses a body that leaves canon out rather than emptying the Story Bible", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await lockedSeries(api, headers);

      const omitted = await api<{ message: string }>(
        "PUT",
        "/staff/series/series-cms-1/story-bible",
        { headers, body: { reason: "housekeeping" } },
      );
      assert.equal(omitted.status, 400);
      assert.match(omitted.body.message, /requires canon as a list of entries/);

      const unchanged = await api<CmsSeriesView>(
        "GET",
        "/staff/series/series-cms-1",
        { headers },
      );
      assert.deepEqual(unchanged.body.storyBible?.canon, canon);
    });
  });

  it("records who reached for Canon, and what happened, either way", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await lockedSeries(api, headers);
      await api("PUT", "/staff/series/series-cms-1/story-bible", {
        headers,
        body: { canon },
      });

      const records = await staffAuditLog(api, headers);
      const canonRecords = records
        .filter((record) => record.action.startsWith("staff.story-bible"))
        .map((record) => [record.action, record.target, record.outcome]);

      assert.deepEqual(canonRecords, [
        ["staff.story-bible.amend", "story-bible:series-cms-1", "allowed"],
        ["staff.story-bible.lock", "story-bible:series-cms-1", "allowed"],
        ["staff.story-bible.amend", "story-bible:series-cms-1", "allowed"],
      ]);
    });
  });
});

describe("Canon is not writable by non-human or unprivileged paths", () => {
  /**
   * A system path such as an AI Factory workflow has no staff credential to
   * present, and the boundary deliberately accepts no self-asserted "I am a
   * workflow" header: evidence a caller writes about itself is not evidence.
   * So every non-staff path arrives as a reader session or as nobody, and the
   * domain refusal of an ai-workflow principal is proven in the shared tests.
   */
  it("refuses a reader session and an unidentified request", async () => {
    await withApi(async (api) => {
      const editor = await editorHeaders(api);
      await lockedSeries(api, editor);

      const attempts: Array<[string, Record<string, string> | undefined]> = [
        ["reader", readerHeaders()],
        ["unidentified", undefined],
      ];

      for (const [name, headers] of attempts) {
        const refused = await api<{ error: string }>(
          "PUT",
          "/staff/series/series-cms-1/story-bible",
          {
            ...(headers ? { headers } : {}),
            body: { canon: [{ id: "world-rule-1", statement: "Rewritten." }] },
          },
        );

        assert.equal(refused.status, 401, name);
        assert.equal(refused.body.error, "staff-access-required", name);
      }

      const unchanged = await api<CmsSeriesView>(
        "GET",
        "/staff/series/series-cms-1",
        { headers: editor },
      );
      assert.deepEqual(unchanged.body.storyBible?.canon, canon);
    });
  });

  it("refuses a Staff Account that holds no canon:write, and keeps the attempt", async () => {
    await withApi(async (api) => {
      const editor = await editorHeaders(api);
      await lockedSeries(api, editor);

      const refused = await api<{ error: string }>(
        "PUT",
        "/staff/series/series-cms-1/story-bible",
        {
          headers: await moderatorHeaders(api),
          body: { canon: [{ id: "world-rule-1", statement: "Rewritten." }] },
        },
      );
      assert.equal(refused.status, 403);
      assert.equal(refused.body.error, "staff-access-required");

      const records = await staffAuditLog(api, editor);
      const refusal = records.find((record) => record.outcome === "denied");

      assert.deepEqual(refusal?.actor, {
        kind: "staff",
        staffAccountId: "staff-moderator-1",
      });
      assert.equal(refusal?.action, "staff.story-bible.amend");
      assert.equal(refusal?.target, "story-bible:series-cms-1");
    });
  });
});

describe("draft Chapter in the staff CMS", () => {
  it("attaches a draft to a governed Series without any public reach", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await api("POST", "/staff/series", { headers, body: seriesBody });

      const draft = await api<ChapterDraft>(
        "POST",
        "/staff/series/series-cms-1/chapters",
        {
          headers,
          body: {
            id: "chuong-cms-1",
            chapterNumber: 1,
            title: "Mùi Mưa Đầu Tiên",
            body: "Mưa rơi trên mái ngõ.",
          },
        },
      );
      assert.equal(draft.status, 201);
      assert.equal(draft.body.seriesId, "series-cms-1");
      assert.equal(draft.body.creativeDisclosure, "Hybrid");
      assert.equal(draft.body.rightsRecordId, undefined);
      assert.equal(draft.body.qualityGate, undefined);

      const cms = await api<CmsSeriesView>(
        "GET",
        "/staff/series/series-cms-1",
        {
          headers,
        },
      );
      assert.deepEqual(
        cms.body.chapterDrafts.map((entry) => entry.id),
        ["chuong-cms-1"],
      );

      for (const path of [
        "/catalog/series/series-cms-1",
        "/catalog/series/series-cms-1/chapters/chuong-cms-1",
      ]) {
        const publicRead = await api("GET", path);
        assert.equal(publicRead.status, 404, path);
      }
    });
  });

  it("refuses a draft for a Series the CMS does not govern", async () => {
    await withApi(async (api) => {
      const orphan = await api("POST", "/staff/series/series-nobody/chapters", {
        headers: await editorHeaders(api),
        body: {
          id: "chuong-cms-1",
          chapterNumber: 1,
          title: "Mùi Mưa Đầu Tiên",
          body: "Mưa rơi trên mái ngõ.",
        },
      });

      assert.equal(orphan.status, 404);
    });
  });

  it("refuses a second draft claiming the same chapter number in a Series", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await api("POST", "/staff/series", { headers, body: seriesBody });
      const draft = {
        chapterNumber: 1,
        title: "Mùi Mưa Đầu Tiên",
        body: "Mưa rơi trên mái ngõ.",
      };
      await api("POST", "/staff/series/series-cms-1/chapters", {
        headers,
        body: { ...draft, id: "chuong-cms-1" },
      });

      const clash = await api("POST", "/staff/series/series-cms-1/chapters", {
        headers,
        body: { ...draft, id: "chuong-cms-1-bis" },
      });

      assert.equal(clash.status, 409);
    });
  });

  it("rewrites a draft's prose, and refuses a rewrite that empties it", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await authoredDraft(api, headers);

      const revised = await api<ChapterDraft>("PUT", draftPath, {
        headers,
        body: { body: "Mưa rơi trên mái ngói." },
      });

      assert.equal(revised.status, 200, JSON.stringify(revised.body));
      assert.equal(revised.body.body, "Mưa rơi trên mái ngói.");
      assert.equal(revised.body.title, "Mùi Mưa Đầu Tiên");

      const emptied = await api("PUT", draftPath, {
        headers,
        body: { body: "   " },
      });

      assert.equal(emptied.status, 400);
    });
  });

  it("refuses a rewrite that names neither a title nor prose", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await authoredDraft(api, headers);

      const nothing = await api("PUT", draftPath, { headers, body: {} });

      assert.equal(nothing.status, 400);
    });
  });

  it("keeps a rewrite that changes nothing out of the Provenance Ledger", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await authoredDraft(api, headers);

      const unchanged = await api<ChapterDraft>("PUT", draftPath, {
        headers,
        body: { body: "Mưa rơi trên mái ngõ." },
      });
      assert.equal(unchanged.status, 200);

      const lineage = await api<{ entries: { action: string }[] }>(
        "GET",
        "/staff/series/series-cms-1/provenance",
        { headers },
      );

      assert.equal(
        lineage.body.entries.filter(
          (entry) => entry.action === "chapter-draft.revise",
        ).length,
        0,
      );
    });
  });

  it("refuses a reader session the CMS write", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await api("POST", "/staff/series", { headers, body: seriesBody });

      const refused = await api<{ error: string }>(
        "POST",
        "/staff/series/series-cms-1/chapters",
        {
          headers: readerHeaders(),
          body: {
            id: "chuong-cms-1",
            chapterNumber: 1,
            title: "Mùi Mưa Đầu Tiên",
            body: "Mưa rơi trên mái ngõ.",
          },
        },
      );

      assert.equal(refused.status, 401);
      assert.equal(refused.body.error, "staff-access-required");
    });
  });
});

const draftPath = "/staff/series/series-cms-1/chapters/chuong-cms-1";

/** A governed Series holding one authored draft Chapter. */
async function authoredDraft(
  api: ApiClient,
  headers: Record<string, string>,
): Promise<void> {
  await api("POST", "/staff/series", { headers, body: seriesBody });
  const authored = await api("POST", "/staff/series/series-cms-1/chapters", {
    headers,
    body: {
      id: "chuong-cms-1",
      chapterNumber: 1,
      title: "Mùi Mưa Đầu Tiên",
      body: "Mưa rơi trên mái ngõ.",
    },
  });

  assert.equal(authored.status, 201, JSON.stringify(authored.body));
}

/** Signs in as the editor and returns the staff header its session travels on. */
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

/** A governed Series whose Canon is defined and locked, oldest record first. */
async function lockedSeries(
  api: ApiClient,
  headers: Record<string, string>,
): Promise<void> {
  await api("POST", "/staff/series", { headers, body: seriesBody });
  await api("PUT", "/staff/series/series-cms-1/story-bible", {
    headers,
    body: { canon },
  });
  await api("POST", "/staff/series/series-cms-1/story-bible/lock", { headers });
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
