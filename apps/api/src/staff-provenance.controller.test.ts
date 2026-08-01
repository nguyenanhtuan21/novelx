import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createReaderPrincipal,
  type ManagedTaxonomy,
  type ProvenanceEntry,
  type StaffAuditRecord,
} from "@novelx/shared";

import { restoreEnv, withApi, type ApiClient } from "./api-test-client.js";
import { signReaderSessionToken } from "./reader-session-token.js";

const editorCredential = "staff-editor-1-access-credential";
const historianCredential = "staff-historian-1-access-credential";
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
      "provenance:read",
      "audit:read",
    ],
    credentialSha256: createHash("sha256")
      .update(editorCredential)
      .digest("hex"),
  },
  {
    // Holds no provenance:read, so lineage is not readable by any Staff Account
    // that happens to hold some other permission.
    id: "staff-historian-1",
    permissions: ["series:read", "audit:read"],
    credentialSha256: createHash("sha256")
      .update(historianCredential)
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

const canon = [{ id: "canon-1", statement: "Mưa Ngâu chỉ rơi vào tháng bảy." }];

const draftBody = {
  id: "chuong-1",
  chapterNumber: 1,
  title: "Mùi Mưa Đầu Tiên",
  body: "Mưa rơi trên mái ngõ.",
};

const material = { id: "asset-cover-illustration-1", kind: "asset" };

const rightsRecordBody = {
  id: "rights-1",
  material,
  owner: "Studio Mưa Ngâu",
  scope: ["ai-workflow"],
  territories: ["VN"],
  duration: { from: "2026-01-01T00:00:00.000Z" },
  modificationAllowed: true,
  aiUseAllowed: true,
  evidence: { kind: "signed-licence", reference: "contract-2026-014" },
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

describe("lineage of a governed Series", () => {
  it("traces every content operation the Series was built from", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await governedSeries(api, headers);

      const entries = await seriesProvenance(api, headers);

      assert.deepEqual(
        entries.map((entry) => entry.action),
        [
          "series.create",
          "story-bible.amend",
          "story-bible.lock",
          "chapter-draft.author",
        ],
      );
      assert.deepEqual(
        entries.map((entry) => entry.target.kind),
        ["series", "story-bible", "story-bible", "chapter-draft"],
      );

      for (const entry of entries) {
        assert.deepEqual(entry.source, {
          kind: "staff",
          staffAccountId: "staff-editor-1",
        });
        assert.equal(entry.target.seriesId, "series-cms-1");
        assert.ok(Date.parse(entry.recordedAt) > 0, entry.action);
        assert.ok(entry.id.length > 0, entry.action);
      }
    });
  });

  /**
   * Reading lineage changes no content, so it leaves none. A ledger that grew
   * an entry every time somebody looked at it would bury the content history
   * it exists to keep.
   */
  it("records content operations rather than the reading of them", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await governedSeries(api, headers);

      await seriesProvenance(api, headers);
      const entries = await seriesProvenance(api, headers);

      assert.equal(
        entries.filter((entry) => entry.action.includes("read")).length,
        0,
      );
      assert.equal(entries.length, 4);

      // The looking is still accountable — it is simply the other trail's job.
      const auditLog = await api<{ records: StaffAuditRecord[] }>(
        "GET",
        "/staff/audit-log",
        { headers },
      );
      assert.ok(
        auditLog.body.records.some(
          (record) => record.action === "staff.provenance.read",
        ),
      );
    });
  });

  it("holds nothing for a Series the CMS never held", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);

      const read = await api("GET", "/staff/series/series-unknown/provenance", {
        headers,
      });

      assert.equal(read.status, 404);
    });
  });
});

describe("lineage of one traced artifact", () => {
  it("names the Canon each Story Bible amendment produced", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await api("POST", "/staff/series", { headers, body: seriesBody });
      await api("PUT", "/staff/series/series-cms-1/story-bible", {
        headers,
        body: { canon },
      });
      await api("PUT", "/staff/series/series-cms-1/story-bible", {
        headers,
        body: {
          canon: [
            ...canon,
            { id: "canon-2", statement: "Kiếm gãy không rèn lại." },
          ],
        },
      });

      const entries = await targetProvenance(api, headers, {
        kind: "story-bible",
        id: "series-cms-1",
      });

      assert.deepEqual(
        entries.map((entry) => entry.version),
        [
          { kind: "story-bible", canonEntryIds: ["canon-1"], locked: false },
          {
            kind: "story-bible",
            canonEntryIds: ["canon-1", "canon-2"],
            locked: false,
          },
        ],
      );
    });
  });

  /**
   * An earlier entry says what was true when it was written. A second
   * amendment adds a line rather than correcting the first one, which is what
   * makes the ledger evidence instead of a current-state view.
   */
  it("leaves an earlier entry untouched when the artifact changes again", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await api("POST", "/staff/series", { headers, body: seriesBody });
      await api("PUT", "/staff/series/series-cms-1/story-bible", {
        headers,
        body: { canon },
      });
      const [firstAmendment] = await targetProvenance(api, headers, {
        kind: "story-bible",
        id: "series-cms-1",
      });

      await api("POST", "/staff/series/series-cms-1/story-bible/lock", {
        headers,
      });
      const [amended, locked] = await targetProvenance(api, headers, {
        kind: "story-bible",
        id: "series-cms-1",
      });

      assert.deepEqual(amended, firstAmendment);
      assert.deepEqual(locked?.version, {
        kind: "story-bible",
        canonEntryIds: ["canon-1"],
        locked: true,
      });
    });
  });

  it("names the Rights Record that cleared a draft Chapter's material", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await governedSeries(api, headers);
      await api("POST", "/staff/rights-records", {
        headers,
        body: rightsRecordBody,
      });
      await api(
        "POST",
        "/staff/series/series-cms-1/chapters/chuong-1/materials",
        {
          headers,
          body: { material, use: "ai-workflow", territory: "VN" },
        },
      );

      const entries = await targetProvenance(api, headers, {
        kind: "chapter-draft",
        id: "chuong-1",
      });

      assert.deepEqual(
        entries.map((entry) => entry.action),
        ["chapter-draft.author", "chapter-draft.attach-material"],
      );
      assert.deepEqual(
        entries.map((entry) => entry.version),
        [
          { kind: "chapter-draft", chapterNumber: 1, rightsRecordIds: [] },
          {
            kind: "chapter-draft",
            chapterNumber: 1,
            rightsRecordIds: ["rights-1"],
          },
        ],
      );
    });
  });

  it("refuses a target kind the ledger does not trace", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await governedSeries(api, headers);

      const read = await api(
        "GET",
        "/staff/series/series-cms-1/provenance/reader-account/reader-1",
        { headers },
      );

      assert.equal(read.status, 400);
    });
  });

  /**
   * A refused content operation changed nothing, so it leaves no lineage. That
   * attempt is evidence of a different kind, and the Staff Audit Record keeps it.
   */
  it("holds nothing for a content operation the boundary refused", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await governedSeries(api, headers);

      const refused = await api("POST", "/staff/series/series-cms-1/chapters", {
        headers: await historianHeaders(api),
        body: { ...draftBody, id: "chuong-2", chapterNumber: 2 },
      });
      assert.equal(refused.status, 403);

      const entries = await seriesProvenance(api, headers);

      assert.equal(
        entries.filter((entry) => entry.target.id === "chuong-2").length,
        0,
      );
    });
  });
});

describe("reading the Provenance Ledger", () => {
  it("refuses a Staff Account that does not hold provenance:read", async () => {
    await withApi(async (api) => {
      await governedSeries(api, await editorHeaders(api));

      const read = await api("GET", "/staff/series/series-cms-1/provenance", {
        headers: await historianHeaders(api),
      });

      assert.equal(read.status, 403);
    });
  });

  it("refuses a reader session and an unidentified request alike", async () => {
    await withApi(async (api) => {
      await governedSeries(api, await editorHeaders(api));

      for (const headers of [readerHeaders(), {}]) {
        const read = await api("GET", "/staff/series/series-cms-1/provenance", {
          headers,
        });

        assert.equal(read.status, 401);
      }
    });
  });
});

/** A governed Series with locked Canon and one draft Chapter, oldest first. */
async function governedSeries(
  api: ApiClient,
  headers: Record<string, string>,
): Promise<void> {
  await api("POST", "/staff/series", { headers, body: seriesBody });
  await api("PUT", "/staff/series/series-cms-1/story-bible", {
    headers,
    body: { canon },
  });
  await api("POST", "/staff/series/series-cms-1/story-bible/lock", { headers });
  await api("POST", "/staff/series/series-cms-1/chapters", {
    headers,
    body: draftBody,
  });
}

/** The Series' lineage, oldest entry first, the way it was written. */
async function seriesProvenance(
  api: ApiClient,
  headers: Record<string, string>,
): Promise<ProvenanceEntry[]> {
  const read = await api<{ entries: ProvenanceEntry[] }>(
    "GET",
    "/staff/series/series-cms-1/provenance",
    { headers },
  );

  assert.equal(read.status, 200);

  return [...read.body.entries].reverse();
}

async function targetProvenance(
  api: ApiClient,
  headers: Record<string, string>,
  target: { kind: string; id: string },
): Promise<ProvenanceEntry[]> {
  const read = await api<{ entries: ProvenanceEntry[] }>(
    "GET",
    `/staff/series/series-cms-1/provenance/${target.kind}/${target.id}`,
    { headers },
  );

  assert.equal(read.status, 200);

  return [...read.body.entries].reverse();
}

async function editorHeaders(api: ApiClient): Promise<Record<string, string>> {
  return staffHeaders(api, "staff-editor-1", editorCredential);
}

async function historianHeaders(
  api: ApiClient,
): Promise<Record<string, string>> {
  return staffHeaders(api, "staff-historian-1", historianCredential);
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
