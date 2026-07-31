import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import {
  createAnonymousReaderPrincipal,
  createReaderPrincipal,
  READER_ACCOUNT_UPGRADE_REQUIRED,
} from "@novelx/shared";

import { CatalogService } from "./catalog.service.js";
import { InMemoryReaderLibraryRepository } from "./in-memory-reader-library.repository.js";
import { ReaderLibraryService } from "./reader-library.service.js";
import { SeedCatalogRepository } from "./seed-catalog.repository.js";

const reader = createReaderPrincipal({ readerAccountId: "reader-1" });
const anonymous = createAnonymousReaderPrincipal({
  anonymousSessionId: "anon-1",
});

describe("Reader Account library API seam", () => {
  it("shows a followed Series in the Reader Account library", async () => {
    const service = readerLibraryService();

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
    const service = readerLibraryService();
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
    const service = readerLibraryService();
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
    const service = readerLibraryService();

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

describe("Anonymous Reader Session boundary", () => {
  it("prompts an upgrade instead of serving account-only library behavior", async () => {
    const service = readerLibraryService();

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
    const service = readerLibraryService();
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
    const service = readerLibraryService();

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

function readerLibraryService(): ReaderLibraryService {
  let mintedReaderAccounts = 0;

  return new ReaderLibraryService(
    new InMemoryReaderLibraryRepository(),
    new CatalogService(new SeedCatalogRepository()),
    {
      now: () => "2026-07-31T08:00:00.000Z",
      newReaderAccountId: () => `reader-upgraded-${++mintedReaderAccounts}`,
    },
  );
}
