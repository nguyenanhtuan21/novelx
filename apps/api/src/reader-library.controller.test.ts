import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createAnonymousReaderPrincipal,
  createReaderPrincipal,
  type ReaderLibrary,
  type ReadingProgress,
} from "@novelx/shared";

import { restoreEnv, withApi } from "./api-test-client.js";
import { signReaderSessionToken } from "./reader-session-token.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalReaderSessionSecret = process.env.READER_SESSION_SECRET;
const secret = "reader-session-secret-for-tests";
const readerHeaders = sessionHeaders(
  createReaderPrincipal({ readerAccountId: "reader-1" }),
);
const anonymousHeaders = sessionHeaders(
  createAnonymousReaderPrincipal({ anonymousSessionId: "anon-1" }),
);

describe("Reader Account library HTTP API seam", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.READER_SESSION_SECRET = secret;
  });

  afterEach(() => {
    restoreEnv("DATABASE_URL", originalDatabaseUrl);
    restoreEnv("READER_SESSION_SECRET", originalReaderSessionSecret);
  });

  it("follows, lists, and unfollows a Series for a Reader Account", async () => {
    await withApi(async (readerApi) => {
      const followed = await readerApi<ReaderLibrary>(
        "PUT",
        "/reader/library/follows/thanh-kiem-trong-mua",
        { headers: readerHeaders },
      );
      assert.equal(followed.status, 200);
      assert.deepEqual(
        followed.body.entries.map((entry) => entry.series.id),
        ["thanh-kiem-trong-mua"],
      );

      const listed = await readerApi<ReaderLibrary>("GET", "/reader/library", {
        headers: readerHeaders,
      });
      assert.equal(listed.status, 200);
      assert.equal(
        listed.body.entries[0]?.series.title,
        "Thanh Kiếm Trong Mưa",
      );
      assert.equal(listed.body.entries[0]?.continueReading, undefined);

      const unfollowed = await readerApi<ReaderLibrary>(
        "DELETE",
        "/reader/library/follows/thanh-kiem-trong-mua",
        { headers: readerHeaders },
      );
      assert.equal(unfollowed.status, 200);
      assert.deepEqual(unfollowed.body.entries, []);
    });
  });

  it("shows continue-reading state for the followed Series", async () => {
    await withApi(async (readerApi) => {
      await readerApi("PUT", "/reader/library/follows/thanh-kiem-trong-mua", {
        headers: readerHeaders,
      });

      const recorded = await readerApi<ReadingProgress>(
        "PUT",
        "/reader/progress",
        {
          headers: readerHeaders,
          body: {
            seriesId: "thanh-kiem-trong-mua",
            chapterId: "chuong-1",
            position: 1842,
          },
        },
      );
      assert.equal(recorded.status, 200);

      const listed = await readerApi<ReaderLibrary>("GET", "/reader/library", {
        headers: readerHeaders,
      });
      assert.equal(
        listed.body.entries[0]?.continueReading?.chapterId,
        "chuong-1",
      );
      assert.equal(listed.body.entries[0]?.continueReading?.position, 1842);
    });
  });

  it("prompts an Anonymous Reader Session to upgrade before library behavior", async () => {
    await withApi(async (readerApi) => {
      const listed = await readerApi<{ error: string; upgradePath: string }>(
        "GET",
        "/reader/library",
        { headers: anonymousHeaders },
      );

      assert.equal(listed.status, 401);
      assert.equal(listed.body.error, "reader-account-upgrade-required");
      assert.equal(listed.body.upgradePath, "/reader/accounts");

      const followed = await readerApi<{ error: string }>(
        "PUT",
        "/reader/library/follows/thanh-kiem-trong-mua",
        { headers: anonymousHeaders },
      );
      assert.equal(followed.status, 401);
      assert.equal(followed.body.error, "reader-account-upgrade-required");
    });
  });

  it("keeps one Reader Account library out of another", async () => {
    await withApi(async (readerApi) => {
      await readerApi("PUT", "/reader/library/follows/thanh-kiem-trong-mua", {
        headers: readerHeaders,
      });

      const otherReader = await readerApi<ReaderLibrary>(
        "GET",
        "/reader/library",
        {
          headers: sessionHeaders(
            createReaderPrincipal({ readerAccountId: "reader-2" }),
          ),
        },
      );

      assert.deepEqual(otherReader.body.entries, []);
    });
  });

  it("refuses to follow a Series that is not in the public Curated Catalog", async () => {
    await withApi(async (readerApi) => {
      const followed = await readerApi(
        "PUT",
        "/reader/library/follows/series-chua-cong-khai",
        { headers: readerHeaders },
      );

      assert.equal(followed.status, 404);
    });
  });

  it("refuses to store session state for an unidentified reader", async () => {
    await withApi(async (readerApi) => {
      const recorded = await readerApi("PUT", "/reader/progress", {
        headers: {},
        body: {
          seriesId: "thanh-kiem-trong-mua",
          chapterId: "chuong-1",
          position: 1842,
        },
      });
      assert.equal(recorded.status, 400);

      const upgraded = await readerApi("POST", "/reader/accounts", {
        headers: {},
      });
      assert.equal(upgraded.status, 400);
    });
  });

  it("upgrades an Anonymous Reader Session into a Reader Account with its progress", async () => {
    await withApi(async (readerApi) => {
      await readerApi("PUT", "/reader/progress", {
        headers: anonymousHeaders,
        body: {
          seriesId: "thanh-kiem-trong-mua",
          chapterId: "chuong-1",
          position: 1842,
        },
      });

      const upgraded = await readerApi<{
        readerAccountId: string;
        token: string;
      }>("POST", "/reader/accounts", { headers: anonymousHeaders });
      assert.equal(upgraded.status, 201);

      const upgradedHeaders = {
        authorization: `Bearer ${upgraded.body.token}`,
      };
      await readerApi("PUT", "/reader/library/follows/thanh-kiem-trong-mua", {
        headers: upgradedHeaders,
      });
      const listed = await readerApi<ReaderLibrary>("GET", "/reader/library", {
        headers: upgradedHeaders,
      });

      assert.equal(listed.body.entries[0]?.continueReading?.position, 1842);
    });
  });

  it("issues an Anonymous Reader Session token to a reader with none", async () => {
    await withApi(async (readerApi) => {
      const started = await readerApi<{ token: string }>(
        "POST",
        "/reader/sessions",
        { headers: {} },
      );

      assert.equal(started.status, 201);
      const recorded = await readerApi("PUT", "/reader/progress", {
        headers: { authorization: `Bearer ${started.body.token}` },
        body: {
          seriesId: "thanh-kiem-trong-mua",
          chapterId: "chuong-1",
          position: 1842,
        },
      });
      assert.equal(recorded.status, 200);
    });
  });
});

describe("forged reader identity", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.READER_SESSION_SECRET = secret;
  });

  afterEach(() => {
    restoreEnv("DATABASE_URL", originalDatabaseUrl);
    restoreEnv("READER_SESSION_SECRET", originalReaderSessionSecret);
  });

  it("refuses to act as a Reader Account named by an unsigned or re-signed token", async () => {
    await withApi(async (readerApi) => {
      await readerApi("PUT", "/reader/library/follows/thanh-kiem-trong-mua", {
        headers: readerHeaders,
      });

      for (const forged of [
        "Bearer reader-1",
        `Bearer ${Buffer.from(
          JSON.stringify({
            kind: "reader",
            id: "reader-1",
            issuedAt: "2026-07-31T08:00:00.000Z",
          }),
        ).toString("base64url")}.forged-signature`,
        `Bearer ${signReaderSessionToken({
          principal: createReaderPrincipal({ readerAccountId: "reader-1" }),
          secret: "an-attacker-secret",
          issuedAt: "2026-07-31T08:00:00.000Z",
        })}`,
      ]) {
        const listed = await readerApi<{ error?: string }>(
          "GET",
          "/reader/library",
          { headers: { authorization: forged } },
        );

        assert.equal(listed.status, 401, forged);
        assert.equal(listed.body.error, "reader-account-upgrade-required");
      }
    });
  });
});

function sessionHeaders(
  principal: Parameters<typeof signReaderSessionToken>[0]["principal"],
): Record<string, string> {
  return {
    authorization: `Bearer ${signReaderSessionToken({
      principal,
      secret,
      issuedAt: "2026-07-31T08:00:00.000Z",
    })}`,
  };
}
