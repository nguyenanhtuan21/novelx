import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertReaderAccountPrincipal,
  buildReaderLibrary,
  createAnonymousReaderPrincipal,
  createReaderAccount,
  createReaderPrincipal,
  createSeries,
  followSeries,
  ReaderAccountUpgradeRequiredError,
  recordReaderProgress,
  unfollowSeries,
  type PublicCatalogSeries,
} from "./index.js";

describe("Series follow", () => {
  it("records a followed Series on a Reader Account", () => {
    const reader = followSeries(createReaderAccount({ id: "reader-1" }), {
      seriesId: "thanh-kiem-trong-mua",
      followedAt: "2026-07-31T00:00:00.000Z",
    });

    assert.deepEqual(reader.follows["thanh-kiem-trong-mua"], {
      seriesId: "thanh-kiem-trong-mua",
      followedAt: "2026-07-31T00:00:00.000Z",
    });
  });

  it("drops the followed Series when a Reader Account unfollows it", () => {
    const following = followSeries(createReaderAccount({ id: "reader-1" }), {
      seriesId: "thanh-kiem-trong-mua",
      followedAt: "2026-07-31T00:00:00.000Z",
    });

    const unfollowed = unfollowSeries(following, {
      seriesId: "thanh-kiem-trong-mua",
    });

    assert.deepEqual(unfollowed.follows, {});
    assert.deepEqual(Object.keys(following.follows), ["thanh-kiem-trong-mua"]);
  });
});

describe("Reader Account library", () => {
  it("lists followed Series with continue-reading state, most recently read first", () => {
    const followedFirst = followSeries(
      createReaderAccount({ id: "reader-1" }),
      {
        seriesId: "thanh-kiem-trong-mua",
        followedAt: "2026-07-30T00:00:00.000Z",
      },
    );
    const followedSecond = followSeries(followedFirst, {
      seriesId: "den-long-tren-bien-may",
      followedAt: "2026-07-31T00:00:00.000Z",
    });
    const reader = recordReaderProgress(followedSecond, {
      seriesId: "thanh-kiem-trong-mua",
      chapterId: "chuong-2",
      position: 1842,
      updatedAt: "2026-07-31T09:00:00.000Z",
    });

    const library = buildReaderLibrary({
      reader,
      catalog: [
        publicCatalogSeries("den-long-tren-bien-may"),
        publicCatalogSeries("thanh-kiem-trong-mua"),
      ],
    });

    assert.deepEqual(
      library.entries.map((entry) => entry.series.id),
      ["thanh-kiem-trong-mua", "den-long-tren-bien-may"],
    );
    assert.deepEqual(library.entries[0]?.continueReading, {
      seriesId: "thanh-kiem-trong-mua",
      chapterId: "chuong-2",
      position: 1842,
      updatedAt: "2026-07-31T09:00:00.000Z",
    });
    assert.equal(library.entries[1]?.continueReading, undefined);
  });
});

describe("account-only library behavior", () => {
  it("asks an Anonymous Reader Session to upgrade instead of serving library behavior", () => {
    const anonymous = createAnonymousReaderPrincipal({
      anonymousSessionId: "anon-1",
    });

    assert.throws(
      () => assertReaderAccountPrincipal(anonymous),
      (error: unknown) =>
        error instanceof ReaderAccountUpgradeRequiredError &&
        error.code === "reader-account-upgrade-required",
    );
    assert.doesNotThrow(() =>
      assertReaderAccountPrincipal(
        createReaderPrincipal({ readerAccountId: "reader-1" }),
      ),
    );
  });
});

function publicCatalogSeries(id: string): PublicCatalogSeries {
  return {
    ...createSeries({
      id,
      title: `Series ${id}`,
      synopsis: "Series trong Curated Catalog.",
      creativeDisclosure: "Hybrid",
      taxonomy: {
        genre: "fantasy",
        subgenre: "kiem-hiep",
        tropes: [],
        moods: [],
        themes: [],
        audience: "young-adult",
        ageRating: "13+",
        contentWarnings: [],
      },
      status: "active",
    }),
    firstPublicChapterId: "chuong-1",
  };
}
