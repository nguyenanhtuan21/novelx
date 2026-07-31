import "reflect-metadata";

import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, it } from "node:test";

import { NestFactory } from "@nestjs/core";
import type { AnonymousReaderSession, ReadingProgress } from "@novelx/shared";

import { AppModule } from "./app.module.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const seedProgressKey = "thanh-kiem-trong-mua/chuong-1";

describe("Anonymous Reader Session progress HTTP API seam", () => {
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

  it("stores only lightweight progress for public Chapter reads", async () => {
    const app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0);

    try {
      const address = app.getHttpServer().address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${address.port}/reader-sessions/anon-1/progress`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            seriesId: "thanh-kiem-trong-mua",
            chapterId: "chuong-1",
            position: 1842,
            updatedAt: "2026-07-31T00:00:00.000Z",
          }),
        },
      );
      const body = await response.text();

      assert.equal(response.status, 201, body);
      const session = JSON.parse(body) as AnonymousReaderSession;

      assert.equal(session.id, "anon-1");
      assert.equal(session.progress[seedProgressKey]?.position, 1842);
      assert.deepEqual(Object.keys(session).sort(), ["id", "progress"]);
      assert.doesNotMatch(body, /entitlements|permissions|staffAccountId/i);
    } finally {
      await app.close();
    }
  });

  it("preserves anonymous progress when upgrading to a Reader Account", async () => {
    const app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0);

    try {
      const address = app.getHttpServer().address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const progressResponse = await fetch(
        `${baseUrl}/reader-sessions/anon-upgrade/progress`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            seriesId: "thanh-kiem-trong-mua",
            chapterId: "chuong-1",
            position: 2301,
            updatedAt: "2026-07-31T00:05:00.000Z",
          }),
        },
      );
      const progressBody = await progressResponse.text();
      assert.equal(progressResponse.status, 201, progressBody);

      const upgradeResponse = await fetch(
        `${baseUrl}/reader-accounts/reader-1/anonymous-session-upgrade`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: "anon-upgrade" }),
        },
      );
      const upgradeBody = await upgradeResponse.text();

      assert.equal(upgradeResponse.status, 201, upgradeBody);
      const reader = JSON.parse(upgradeBody) as {
        id: string;
        progress: Record<string, ReadingProgress>;
      };

      assert.equal(reader.id, "reader-1");
      assert.equal(reader.progress[seedProgressKey]?.position, 2301);
      assert.equal(
        reader.progress[seedProgressKey]?.updatedAt,
        "2026-07-31T00:05:00.000Z",
      );
      assert.deepEqual(Object.keys(reader).sort(), ["id", "progress"]);
      assert.doesNotMatch(
        upgradeBody,
        /entitlements|permissions|staffAccountId/i,
      );

      const readerProgressResponse = await fetch(
        `${baseUrl}/reader-accounts/${reader.id}/progress`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            seriesId: "thanh-kiem-trong-mua",
            chapterId: "chuong-1",
            position: 2400,
            updatedAt: "2026-07-31T00:10:00.000Z",
          }),
        },
      );
      const readerProgressBody = await readerProgressResponse.text();

      assert.equal(readerProgressResponse.status, 201, readerProgressBody);
      const readerAfterProgress = JSON.parse(readerProgressBody) as {
        id: string;
        progress: Record<string, ReadingProgress>;
      };
      assert.equal(readerAfterProgress.id, "reader-1");
      assert.equal(
        readerAfterProgress.progress[seedProgressKey]?.position,
        2400,
      );
      assert.deepEqual(Object.keys(readerAfterProgress).sort(), [
        "id",
        "progress",
      ]);
      assert.doesNotMatch(
        readerProgressBody,
        /entitlements|permissions|staffAccountId/i,
      );

      const repeatedUpgradeResponse = await fetch(
        `${baseUrl}/reader-accounts/reader-1/anonymous-session-upgrade`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: "anon-upgrade" }),
        },
      );
      const repeatedUpgradeBody = await repeatedUpgradeResponse.text();

      assert.equal(repeatedUpgradeResponse.status, 201, repeatedUpgradeBody);
      const readerAfterRepeatedUpgrade = JSON.parse(repeatedUpgradeBody) as {
        id: string;
        progress: Record<string, ReadingProgress>;
      };
      assert.equal(
        readerAfterRepeatedUpgrade.progress[seedProgressKey]?.position,
        2400,
      );
    } finally {
      await app.close();
    }
  });

  it("rejects an account upgrade when the anonymous session was not recorded", async () => {
    const app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0);

    try {
      const address = app.getHttpServer().address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${address.port}/reader-accounts/reader-missing/anonymous-session-upgrade`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: "missing-session" }),
        },
      );
      const body = await response.text();

      assert.equal(response.status, 404, body);
      assert.match(body, /Anonymous Reader Session not found/);
    } finally {
      await app.close();
    }
  });
});
