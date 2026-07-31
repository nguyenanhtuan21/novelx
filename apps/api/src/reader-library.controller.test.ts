import "reflect-metadata";

import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, it } from "node:test";

import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import type { ReaderLibrary, ReadingProgress } from "@novelx/shared";

import { AppModule } from "./app.module.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const readerHeaders = { "x-novelx-reader-account-id": "reader-1" };
const anonymousHeaders = { "x-novelx-anonymous-session-id": "anon-1" };

describe("Reader Account library HTTP API seam", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
      return;
    }

    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("follows, lists, and unfollows a Series for a Reader Account", async () => {
    await withReaderApi(async (readerApi) => {
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
    await withReaderApi(async (readerApi) => {
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
    await withReaderApi(async (readerApi) => {
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
    await withReaderApi(async (readerApi) => {
      await readerApi("PUT", "/reader/library/follows/thanh-kiem-trong-mua", {
        headers: readerHeaders,
      });

      const otherReader = await readerApi<ReaderLibrary>(
        "GET",
        "/reader/library",
        { headers: { "x-novelx-reader-account-id": "reader-2" } },
      );

      assert.deepEqual(otherReader.body.entries, []);
    });
  });

  it("refuses to follow a Series that is not in the public Curated Catalog", async () => {
    await withReaderApi(async (readerApi) => {
      const followed = await readerApi(
        "PUT",
        "/reader/library/follows/series-chua-cong-khai",
        { headers: readerHeaders },
      );

      assert.equal(followed.status, 404);
    });
  });

  it("refuses to store session state for an unidentified reader", async () => {
    await withReaderApi(async (readerApi) => {
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
    await withReaderApi(async (readerApi) => {
      await readerApi("PUT", "/reader/progress", {
        headers: anonymousHeaders,
        body: {
          seriesId: "thanh-kiem-trong-mua",
          chapterId: "chuong-1",
          position: 1842,
        },
      });

      const upgraded = await readerApi<{ readerAccountId: string }>(
        "POST",
        "/reader/accounts",
        { headers: anonymousHeaders },
      );
      assert.equal(upgraded.status, 201);

      const upgradedHeaders = {
        "x-novelx-reader-account-id": upgraded.body.readerAccountId,
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
});

type ReaderApi = <T>(
  method: string,
  path: string,
  init: { headers: Record<string, string>; body?: unknown },
) => Promise<{ status: number; body: T }>;

async function withReaderApi(
  run: (readerApi: ReaderApi) => Promise<void>,
): Promise<void> {
  const app: INestApplication = await NestFactory.create(AppModule, {
    logger: false,
  });
  await app.listen(0);

  try {
    const { port } = app.getHttpServer().address() as AddressInfo;

    await run(async (method, path, init) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: {
          ...init.headers,
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      });
      const text = await response.text();

      return { status: response.status, body: JSON.parse(text) };
    });
  } finally {
    await app.close();
  }
}
