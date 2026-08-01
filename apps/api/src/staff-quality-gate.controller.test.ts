import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createReaderPrincipal,
  type ManagedTaxonomy,
  type ProvenanceEntry,
  type QualityGateResult,
  type ReportedQualityCheck,
} from "@novelx/shared";

import { restoreEnv, withApi, type ApiClient } from "./api-test-client.js";
import { signReaderSessionToken } from "./reader-session-token.js";

const editorCredential = "staff-editor-1-access-credential";
const readerOnlyCredential = "staff-reader-only-1-access-credential";
const readerSecret = "reader-session-secret-for-tests";

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
    // May read a Series and so may read a gate result, but declaring what the
    // content checks found is a separate authority this account does not hold.
    id: "staff-reader-only-1",
    permissions: ["series:read"],
    credentialSha256: createHash("sha256")
      .update(readerOnlyCredential)
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
  scope: ["publishing"],
  territories: ["VN"],
  duration: { from: "2026-01-01T00:00:00.000Z" },
  modificationAllowed: true,
  aiUseAllowed: false,
  evidence: { kind: "signed-licence", reference: "contract-2026-014" },
};

const reportedChecks: readonly ReportedQualityCheck[] = [
  { condition: "canonContinuity", verdict: "pass", score: 96 },
  { condition: "policySafety", verdict: "pass", score: 99 },
  { condition: "originalityIp", verdict: "pass", score: 97 },
  {
    condition: "metadata",
    verdict: "warning",
    score: 88,
    note: "Thiếu trope phụ.",
  },
];

const qualityGatePath =
  "/staff/series/series-cms-1/chapters/chuong-1/quality-gate";

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

describe("running the Quality Gate", () => {
  /**
   * A draft that has only been written has been checked by nobody, and the gate
   * says so condition by condition rather than answering with one number.
   */
  it("blocks every condition nothing has answered yet", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await governedSeries(api, headers);

      const run = await api<QualityGateResult>("POST", qualityGatePath, {
        headers,
        body: { reportedChecks: [] },
      });

      assert.equal(run.status, 201);
      assert.deepEqual(run.body.blockingFailures, [
        "canonContinuity",
        "policySafety",
        "originalityIp",
        "metadata",
        "rightsRecord",
        "humanApproval",
      ]);
      assert.equal(run.body.publicPublishingReady, false);
      assert.equal(run.body.chapterId, "chuong-1");
      // Authoring the draft left lineage, so provenance is the one recorded
      // condition a fresh draft already answers.
      assert.equal(
        run.body.findings.find(
          (finding) => finding.condition === "provenanceLedger",
        )?.verdict,
        "pass",
      );
    });
  });

  it("passes the conditions a cleared draft and reported checks answer, and holds public publishing for approval", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await clearedDraft(api, headers);

      const run = await api<QualityGateResult>("POST", qualityGatePath, {
        headers,
        body: { reportedChecks },
      });

      assert.equal(run.status, 201);
      assert.deepEqual(run.body.blockingFailures, ["humanApproval"]);
      assert.equal(run.body.publicPublishingReady, false);
      assert.equal(run.body.meanReportedScore, 95);
      // A warning is something an editor reads, not something that blocks.
      assert.equal(
        run.body.findings.find((finding) => finding.condition === "metadata")
          ?.verdict,
        "warning",
      );
    });
  });

  /**
   * The property the whole gate rests on: a chapter scoring a hundred on every
   * check that was made is still blocked by the one that failed.
   */
  it("keeps a blocking failure that a perfect aggregate score cannot override", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await clearedDraft(api, headers);

      const run = await api<QualityGateResult>("POST", qualityGatePath, {
        headers,
        body: {
          reportedChecks: reportedChecks.map((check) => ({
            ...check,
            score: 100,
            verdict:
              check.condition === "policySafety" ? "blocking-failure" : "pass",
          })),
        },
      });

      assert.equal(run.body.meanReportedScore, 100);
      assert.ok(run.body.blockingFailures.includes("policySafety"));
      assert.equal(run.body.publicPublishingReady, false);
    });
  });

  it("refuses a reported check that speaks for a condition the record answers", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await clearedDraft(api, headers);

      const run = await api<{ message: string }>("POST", qualityGatePath, {
        headers,
        body: {
          reportedChecks: [
            ...reportedChecks,
            { condition: "humanApproval", verdict: "pass" },
          ],
        },
      });

      assert.equal(run.status, 400);
      assert.match(run.body.message, /answered by the record/);
    });
  });

  it("refuses a run that does not state its reported checks as a list", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await governedSeries(api, headers);

      const run = await api("POST", qualityGatePath, {
        headers,
        body: { reportedChecks: "all good" },
      });

      assert.equal(run.status, 400);
    });
  });

  it("answers as unknown for a draft Chapter the Series does not hold", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await governedSeries(api, headers);

      const run = await api(
        "POST",
        "/staff/series/series-cms-1/chapters/chuong-9/quality-gate",
        { headers, body: { reportedChecks: [] } },
      );

      assert.equal(run.status, 404);
    });
  });
});

describe("viewing a Quality Gate result", () => {
  it("answers with what the last run concluded", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await clearedDraft(api, headers);
      const run = await api<QualityGateResult>("POST", qualityGatePath, {
        headers,
        body: { reportedChecks },
      });

      const viewed = await api<QualityGateResult>("GET", qualityGatePath, {
        headers: await readerOnlyHeaders(api),
      });

      assert.equal(viewed.status, 200);
      assert.deepEqual(viewed.body, run.body);
    });
  });

  it("holds nothing for a draft Chapter the gate has not run on", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await governedSeries(api, headers);

      const viewed = await api("GET", qualityGatePath, { headers });

      assert.equal(viewed.status, 404);
    });
  });
});

describe("what the Quality Gate leaves behind", () => {
  /**
   * Evaluating content is one of the things the ledger exists to keep, and an
   * entry that did not say what the evaluation concluded would be
   * indistinguishable from the next run's.
   */
  it("appends what each run concluded to the Provenance Ledger", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await clearedDraft(api, headers);

      await api("POST", qualityGatePath, {
        headers,
        body: {
          reportedChecks: reportedChecks.map((check) =>
            check.condition === "policySafety"
              ? { ...check, verdict: "blocking-failure" }
              : check,
          ),
        },
      });
      await api("POST", qualityGatePath, { headers, body: { reportedChecks } });

      const entries = await draftLineage(api, headers);
      const runs = entries.filter(
        (entry) => entry.action === "chapter-draft.quality-gate",
      );

      assert.equal(runs.length, 2);
      assert.deepEqual(
        runs.map((entry) =>
          entry.version.kind === "chapter-draft"
            ? entry.version.qualityGate?.blockingFailures
            : undefined,
        ),
        [["policySafety", "humanApproval"], ["humanApproval"]],
      );
    });
  });

  it("audits the run, and the refusal of a run alike", async () => {
    await withApi(async (api) => {
      const headers = await editorHeaders(api);
      await governedSeries(api, headers);

      await api("POST", qualityGatePath, {
        headers,
        body: { reportedChecks: [] },
      });
      const refused = await api("POST", qualityGatePath, {
        headers: await readerOnlyHeaders(api),
        body: { reportedChecks: [] },
      });
      assert.equal(refused.status, 403);

      const auditLog = await api<{
        records: { action: string; outcome: string; target: string }[];
      }>("GET", "/staff/audit-log", { headers });
      const runs = auditLog.body.records.filter(
        (record) => record.action === "staff.quality-gate.run",
      );

      assert.deepEqual(runs.map((record) => record.outcome).sort(), [
        "allowed",
        "denied",
      ]);
      assert.deepEqual(
        [...new Set(runs.map((record) => record.target))],
        ["chapter-draft:chuong-1"],
      );
    });
  });
});

describe("who may run the Quality Gate", () => {
  it("refuses a Staff Account that does not hold chapter:quality-gate", async () => {
    await withApi(async (api) => {
      await governedSeries(api, await editorHeaders(api));

      const run = await api("POST", qualityGatePath, {
        headers: await readerOnlyHeaders(api),
        body: { reportedChecks: [] },
      });

      assert.equal(run.status, 403);
    });
  });

  it("refuses a reader session and an unidentified request alike", async () => {
    await withApi(async (api) => {
      await governedSeries(api, await editorHeaders(api));

      for (const headers of [readerHeaders(), {}]) {
        const run = await api("POST", qualityGatePath, {
          headers,
          body: { reportedChecks: [] },
        });

        assert.equal(run.status, 401);
      }
    });
  });
});

/** A governed Series with one draft Chapter written against it. */
async function governedSeries(
  api: ApiClient,
  headers: Record<string, string>,
): Promise<void> {
  await api("POST", "/staff/series", { headers, body: seriesBody });
  await api("PUT", "/staff/series/series-cms-1/story-bible", {
    headers,
    body: { canon: [{ id: "canon-1", statement: "Mưa Ngâu rơi tháng bảy." }] },
  });
  await api("POST", "/staff/series/series-cms-1/chapters", {
    headers,
    body: draftBody,
  });
}

/** The same draft, with material a Rights Record cleared for publishing. */
async function clearedDraft(
  api: ApiClient,
  headers: Record<string, string>,
): Promise<void> {
  await governedSeries(api, headers);
  await api("POST", "/staff/rights-records", {
    headers,
    body: rightsRecordBody,
  });
  await api("POST", "/staff/series/series-cms-1/chapters/chuong-1/materials", {
    headers,
    body: { material, use: "publishing", territory: "VN" },
  });
}

/** The draft's lineage, oldest entry first, the way it was written. */
async function draftLineage(
  api: ApiClient,
  headers: Record<string, string>,
): Promise<ProvenanceEntry[]> {
  const read = await api<{ entries: ProvenanceEntry[] }>(
    "GET",
    "/staff/series/series-cms-1/provenance/chapter-draft/chuong-1",
    { headers },
  );

  assert.equal(read.status, 200);

  return [...read.body.entries].reverse();
}

async function editorHeaders(api: ApiClient): Promise<Record<string, string>> {
  return staffHeaders(api, "staff-editor-1", editorCredential);
}

async function readerOnlyHeaders(
  api: ApiClient,
): Promise<Record<string, string>> {
  return staffHeaders(api, "staff-reader-only-1", readerOnlyCredential);
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
