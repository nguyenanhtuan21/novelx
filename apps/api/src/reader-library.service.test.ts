import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createAnonymousReaderPrincipal,
  createReaderPrincipal,
  READER_ACCOUNT_UPGRADE_REQUIRED,
  type PublicCatalogSeries,
} from "@novelx/shared";

import { CatalogService } from "./catalog.service.js";
import { InMemoryEntitlementRequirementRepository } from "./in-memory-entitlement-requirement.repository.js";
import { InMemoryReaderLibraryRepository } from "./in-memory-reader-library.repository.js";
import { ReaderLibraryService } from "./reader-library.service.js";
import { seededCatalogRepository } from "./seeded-catalog.fixture.js";

const reader = createReaderPrincipal({ readerAccountId: "reader-1" });
const anonymous = createAnonymousReaderPrincipal({
  anonymousSessionId: "anon-1",
});

describe("Reader Account library API seam", () => {
  it("shows a followed Series in the Reader Account library", async () => {
    const service = readerLibraryService(await seedCatalogService());

    await service.followSeries({
      principal: reader,
      seriesId: "thanh-kiem-trong-mua",
    });
    const library = await service.getLibrary({ principal: reader });

    assert.deepEqual(
      library.entries.map((entry) => entry.series.id),
      ["thanh-kiem-trong-mua"],
    );
    assert.equal(library.entries[0]?.followedAt, "2026-07-31T08:00:00.000Z");
  });

  it("empties the library when the Reader Account unfollows the Series", async () => {
    const service = readerLibraryService(await seedCatalogService());
    await service.followSeries({
      principal: reader,
      seriesId: "thanh-kiem-trong-mua",
    });

    const library = await service.unfollowSeries({
      principal: reader,
      seriesId: "thanh-kiem-trong-mua",
    });

    assert.deepEqual(library.entries, []);
    assert.deepEqual(
      (await service.getLibrary({ principal: reader })).entries,
      [],
    );
  });

  it("carries continue-reading state recorded through the reader boundary", async () => {
    const service = readerLibraryService(await seedCatalogService());
    await service.followSeries({
      principal: reader,
      seriesId: "thanh-kiem-trong-mua",
    });

    await service.recordProgress({
      principal: reader,
      seriesId: "thanh-kiem-trong-mua",
      chapterId: "chuong-1",
      position: 1842,
    });

    const library = await service.getLibrary({ principal: reader });
    assert.deepEqual(library.entries[0]?.continueReading, {
      seriesId: "thanh-kiem-trong-mua",
      chapterId: "chuong-1",
      position: 1842,
      updatedAt: "2026-07-31T08:00:00.000Z",
    });
  });

  it("refuses to follow a Series outside the public Curated Catalog", async () => {
    const service = readerLibraryService(await seedCatalogService());

    await assert.rejects(
      () =>
        service.followSeries({
          principal: reader,
          seriesId: "series-chua-cong-khai",
        }),
      (error: unknown) => error instanceof NotFoundException,
    );
    assert.deepEqual(
      (await service.getLibrary({ principal: reader })).entries,
      [],
    );
  });
});

describe("recording progress against public content", () => {
  it("refuses progress for a Chapter with no Published Snapshot", async () => {
    const service = readerLibraryService(await seedCatalogService());

    await assert.rejects(
      () =>
        service.recordProgress({
          principal: reader,
          seriesId: "thanh-kiem-trong-mua",
          chapterId: "chuong-chua-xuat-ban",
          position: 10,
        }),
      (error: unknown) => error instanceof NotFoundException,
    );
  });

  it("refuses a position that is not a real place in the Chapter", async () => {
    const service = readerLibraryService(await seedCatalogService());

    for (const position of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await assert.rejects(
        () =>
          service.recordProgress({
            principal: reader,
            seriesId: "thanh-kiem-trong-mua",
            chapterId: "chuong-1",
            position,
          }),
        (error: unknown) => error instanceof BadRequestException,
        `position ${position}`,
      );
    }
  });
});

describe("concurrent writes to one Reader Account library", () => {
  it("keeps both follows when two Series are followed at the same time", async () => {
    const service = readerLibraryService(await twoSeriesCatalog());

    await Promise.all([
      service.followSeries({
        principal: reader,
        seriesId: "thanh-kiem-trong-mua",
      }),
      service.followSeries({
        principal: reader,
        seriesId: "den-long-tren-bien-may",
      }),
    ]);

    const library = await service.getLibrary({ principal: reader });
    assert.deepEqual(library.entries.map((entry) => entry.series.id).sort(), [
      "den-long-tren-bien-may",
      "thanh-kiem-trong-mua",
    ]);
  });

  it("keeps a concurrent follow when another Series is unfollowed", async () => {
    const service = readerLibraryService(await twoSeriesCatalog());
    await service.followSeries({
      principal: reader,
      seriesId: "thanh-kiem-trong-mua",
    });

    await Promise.all([
      service.unfollowSeries({
        principal: reader,
        seriesId: "thanh-kiem-trong-mua",
      }),
      service.followSeries({
        principal: reader,
        seriesId: "den-long-tren-bien-may",
      }),
    ]);

    const library = await service.getLibrary({ principal: reader });
    assert.deepEqual(
      library.entries.map((entry) => entry.series.id),
      ["den-long-tren-bien-may"],
    );
  });

  it("keeps progress for one Series when another Series is written at the same time", async () => {
    const service = readerLibraryService(await twoSeriesCatalog());
    await service.followSeries({
      principal: reader,
      seriesId: "thanh-kiem-trong-mua",
    });
    await service.followSeries({
      principal: reader,
      seriesId: "den-long-tren-bien-may",
    });

    await Promise.all([
      service.recordProgress({
        principal: reader,
        seriesId: "thanh-kiem-trong-mua",
        chapterId: "chuong-1",
        position: 120,
      }),
      service.recordProgress({
        principal: reader,
        seriesId: "den-long-tren-bien-may",
        chapterId: "chuong-mo-dau",
        position: 340,
      }),
    ]);

    const library = await service.getLibrary({ principal: reader });
    assert.deepEqual(
      library.entries.map((entry) => entry.continueReading?.position).sort(),
      [120, 340],
    );
  });
});

describe("Anonymous Reader Session boundary", () => {
  it("prompts an upgrade instead of serving account-only library behavior", async () => {
    const service = readerLibraryService(await seedCatalogService());

    await assert.rejects(
      () =>
        service.followSeries({
          principal: anonymous,
          seriesId: "thanh-kiem-trong-mua",
        }),
      isUpgradePrompt,
    );
    await assert.rejects(
      () =>
        service.unfollowSeries({
          principal: anonymous,
          seriesId: "thanh-kiem-trong-mua",
        }),
      isUpgradePrompt,
    );
    await assert.rejects(
      () => service.getLibrary({ principal: anonymous }),
      isUpgradePrompt,
    );
  });

  it("keeps lightweight progress and hands it to the Reader Account on upgrade", async () => {
    const service = readerLibraryService(await seedCatalogService());
    await service.recordProgress({
      principal: anonymous,
      seriesId: "thanh-kiem-trong-mua",
      chapterId: "chuong-1",
      position: 1842,
    });

    const upgraded = await service.upgradeAnonymousSession({
      principal: anonymous,
    });

    assert.equal(upgraded.readerAccountId, "reader-upgraded-1");
    const library = await service.followSeries({
      principal: createReaderPrincipal({
        readerAccountId: upgraded.readerAccountId,
      }),
      seriesId: "thanh-kiem-trong-mua",
    });
    assert.equal(library.entries[0]?.continueReading?.position, 1842);
  });

  it("upgrades a session once instead of minting a Reader Account per call", async () => {
    const service = readerLibraryService(await seedCatalogService());

    const first = await service.upgradeAnonymousSession({
      principal: anonymous,
    });
    const second = await service.upgradeAnonymousSession({
      principal: anonymous,
    });

    assert.equal(second.readerAccountId, first.readerAccountId);
  });
});

function isUpgradePrompt(error: unknown): boolean {
  return (
    error instanceof UnauthorizedException &&
    (error.getResponse() as { error?: string }).error ===
      READER_ACCOUNT_UPGRADE_REQUIRED
  );
}

async function seedCatalogService(): Promise<CatalogService> {
  return new CatalogService(
    await seededCatalogRepository(),
    new InMemoryEntitlementRequirementRepository(),
    new InMemoryReaderLibraryRepository(),
  );
}

async function twoSeriesCatalog(): Promise<CatalogService> {
  const seedCatalog = await seededCatalogRepository();
  const seedSeries = await seedCatalog.listSeries();
  const seedSnapshot = await seedCatalog.getPublicChapter({
    seriesId: "thanh-kiem-trong-mua",
    chapterId: "chuong-1",
  });
  const publicChapters = new Set([
    "thanh-kiem-trong-mua/chuong-1",
    "den-long-tren-bien-may/chuong-mo-dau",
  ]);

  return new CatalogService(
    {
      listSeries: () => [
        ...seedSeries,
        {
          ...(seedSeries[0] as PublicCatalogSeries),
          id: "den-long-tren-bien-may",
          title: "Đèn Lồng Trên Biển Mây",
          firstPublicChapterId: "chuong-mo-dau",
        },
      ],
      getPublicChapter: (input) =>
        publicChapters.has(`${input.seriesId}/${input.chapterId}`)
          ? seedSnapshot
          : undefined,
    },
    new InMemoryEntitlementRequirementRepository(),
    new InMemoryReaderLibraryRepository(),
  );
}

function readerLibraryService(
  catalogService: CatalogService,
): ReaderLibraryService {
  let mintedReaderAccounts = 0;

  return new ReaderLibraryService(
    new InMemoryReaderLibraryRepository(),
    catalogService,
    {
      now: () => "2026-07-31T08:00:00.000Z",
      newReaderAccountId: () => `reader-upgraded-${++mintedReaderAccounts}`,
    },
  );
}
