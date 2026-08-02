import "reflect-metadata";

import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, it } from "node:test";

import { NestFactory } from "@nestjs/core";
import type { PublicCatalogSeries, PublicChapter } from "@novelx/shared";

import { AppModule } from "./app.module.js";

const originalDatabaseUrl = process.env.DATABASE_URL;

describe("Core Platform catalog HTTP API seam", () => {
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

  it("serializes public Curated Catalog Series for the web app", async () => {
    const app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0);

    try {
      const address = app.getHttpServer().address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${address.port}/catalog/series`,
      );
      const body = await response.text();

      assert.equal(response.status, 200, body);
      const [series] = JSON.parse(body) as PublicCatalogSeries[];

      assert.equal(series?.title, "Thanh Kiếm Trong Mưa");
      assert.equal(series?.status, "active");
      assert.equal(series?.creativeDisclosure, "Hybrid");
      assert.equal(series?.taxonomy.genre, "fantasy");
      assert.equal(series?.firstPublicChapterId, "chuong-1");
    } finally {
      await app.close();
    }
  });

  it("serializes a public Series detail page payload", async () => {
    const app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0);

    try {
      const address = app.getHttpServer().address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${address.port}/catalog/series/thanh-kiem-trong-mua`,
      );
      const body = await response.text();

      assert.equal(response.status, 200, body);
      const series = JSON.parse(body) as PublicCatalogSeries;

      assert.equal(series.title, "Thanh Kiếm Trong Mưa");
      assert.equal(series.creativeDisclosure, "Hybrid");
      assert.deepEqual(series.taxonomy.contentWarnings, ["violence"]);
      assert.equal(series.status, "active");
      assert.equal(series.firstPublicChapterId, "chuong-1");
    } finally {
      await app.close();
    }
  });

  it("serializes public Chapter reads from Published Snapshot data", async () => {
    const app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0);

    try {
      const address = app.getHttpServer().address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${address.port}/catalog/series/thanh-kiem-trong-mua/chapters/chuong-1`,
      );
      const body = await response.text();

      assert.equal(response.status, 200, body);
      const chapter = JSON.parse(body) as PublicChapter;

      assert.equal(chapter.chapterId, "chuong-1");
      assert.equal(chapter.version, 1);
      assert.equal(chapter.title, "Mùi Mưa Đầu Tiên");
      // How the Chapter was cleared, traced, and published stays internal:
      // this route asks for no session at all.
      for (const internal of [
        "provenanceLedgerEntryId",
        "rightsRecordIds",
        "publishedByStaffAccountId",
      ]) {
        assert.equal(internal in chapter, false, internal);
      }
    } finally {
      await app.close();
    }
  });
});
