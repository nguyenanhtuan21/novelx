import "reflect-metadata";

import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, it } from "node:test";

import { NestFactory } from "@nestjs/core";
import type { PublicCatalogSeries } from "@novelx/shared";

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
});
