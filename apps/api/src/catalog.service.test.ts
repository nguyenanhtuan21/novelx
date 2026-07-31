import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CatalogService } from "./catalog.service.js";
import { SeedCatalogRepository } from "./seed-catalog.repository.js";

describe("Core Platform catalog API seam", () => {
  it("exposes curated Series metadata with Creative Disclosure and Managed Taxonomy", async () => {
    const service = new CatalogService(new SeedCatalogRepository());

    const [series] = await service.listSeries();

    assert.equal(series?.creativeDisclosure, "Hybrid");
    assert.equal(series?.taxonomy.genre, "fantasy");
    assert.equal(series?.taxonomy.ageRating, "13+");
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
