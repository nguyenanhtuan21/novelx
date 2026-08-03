import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PublicCatalogSeries } from "@novelx/shared";

import type { CatalogRepository } from "./catalog.repository.js";
import { CatalogService } from "./catalog.service.js";
import { seededCatalogRepository } from "./seeded-catalog.fixture.js";

describe("Core Platform catalog API seam", () => {
  it("exposes curated Series metadata with Creative Disclosure, AI Persona, and Managed Taxonomy", async () => {
    const service = new CatalogService(await seededCatalogRepository());

    const [series] = await service.listSeries();

    assert.equal(series?.creativeDisclosure, "AI-Assisted");
    assert.equal(series?.aiPersona?.displayName, "May Ke Chuyen Mua Kiem");
    assert.equal("canAuthenticate" in (series?.aiPersona ?? {}), false);
    assert.equal("managedContentLineIds" in (series?.aiPersona ?? {}), false);
    assert.equal(series?.firstPublicChapterId, "chuong-1");
    assert.equal(series?.taxonomy.genre, "fantasy");
    assert.equal(series?.taxonomy.ageRating, "13+");
  });

  it("omits Series without a public Chapter from the public catalog", async () => {
    const unreadableSeries: PublicCatalogSeries = {
      id: "ban-nhap-chua-doc-duoc",
      title: "Bản Nháp Chưa Đọc Được",
      synopsis: "Series chưa có Published Snapshot công khai.",
      creativeDisclosure: "Human",
      taxonomy: {
        genre: "drama",
        subgenre: "slice-of-life",
        tropes: [],
        moods: [],
        themes: [],
        audience: "adult",
        ageRating: "18+",
        contentWarnings: [],
      },
      status: "active",
    };
    const readableSeries: PublicCatalogSeries = {
      ...unreadableSeries,
      id: "co-chapter-public",
      firstPublicChapterId: "chuong-1",
    };
    const repository: CatalogRepository = {
      listSeries: () => [unreadableSeries, readableSeries],
      getPublicChapter: () => undefined,
    };
    const service = new CatalogService(repository);

    const seriesList = await service.listSeries();

    assert.deepEqual(
      seriesList.map((series) => series.id),
      ["co-chapter-public"],
    );
  });

  /**
   * A public read serves the Chapter, not the making of it: the grants that
   * cleared it, the lineage it traces, and the Staff Account that published it
   * are how NovelX answers for the Chapter, and this route asks for no session.
   */
  it("serves the reader-facing part of a Published Snapshot and no more", async () => {
    const service = new CatalogService(await seededCatalogRepository());

    const chapter = await service.getPublicChapter({
      seriesId: "thanh-kiem-trong-mua",
      chapterId: "chuong-1",
    });

    assert.equal(chapter.version, 1);
    assert.equal(chapter.title, "Mùi Mưa Đầu Tiên");
    assert.equal(chapter.creativeDisclosure, "AI-Assisted");
    assert.equal(chapter.aiPersona?.disclosure, "AI-operated creative persona");
    assert.equal("canAuthenticate" in (chapter.aiPersona ?? {}), false);
    assert.deepEqual(Object.keys(chapter).sort(), [
      "aiPersona",
      "body",
      "chapterId",
      "chapterNumber",
      "creativeDisclosure",
      "id",
      "publishedAt",
      "seriesId",
      "title",
      "version",
    ]);
  });
});
