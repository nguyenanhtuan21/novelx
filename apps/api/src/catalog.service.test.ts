import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PublicCatalogSeries } from "@novelx/shared";

import type { CatalogRepository } from "./catalog.repository.js";
import { CatalogService } from "./catalog.service.js";
import { SeedCatalogRepository } from "./seed-catalog.repository.js";

describe("Core Platform catalog API seam", () => {
  it("exposes curated Series metadata with Creative Disclosure and Managed Taxonomy", async () => {
    const service = new CatalogService(new SeedCatalogRepository());

    const [series] = await service.listSeries();

    assert.equal(series?.creativeDisclosure, "Hybrid");
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

  it("serves only a Published Snapshot for public chapter reads", async () => {
    const service = new CatalogService(new SeedCatalogRepository());

    const chapter = await service.getPublicChapter({
      seriesId: "thanh-kiem-trong-mua",
      chapterId: "chuong-1",
    });

    assert.equal(chapter.publiclyReadable, true);
    assert.equal(chapter.version, 1);
    assert.equal(chapter.provenanceLedgerEntryId, "prov-seed-1");
  });
});
