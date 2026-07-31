import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PublicCatalogSeries } from "@novelx/shared";
import { renderToStaticMarkup } from "react-dom/server";

import { ReaderLibraryView } from "./library-view.js";

describe("Reader Account library view", () => {
  it("lists followed Series with continue-reading state", () => {
    const html = renderToStaticMarkup(
      ReaderLibraryView({
        session: {
          kind: "reader",
          library: {
            entries: [
              {
                series: publicCatalogSeries("thanh-kiem-trong-mua"),
                followedAt: "2026-07-30T00:00:00.000Z",
                continueReading: {
                  seriesId: "thanh-kiem-trong-mua",
                  chapterId: "chuong-3",
                  position: 1842,
                  updatedAt: "2026-07-31T09:00:00.000Z",
                },
              },
              {
                series: publicCatalogSeries("den-long-tren-bien-may"),
                followedAt: "2026-07-31T00:00:00.000Z",
              },
            ],
          },
        },
      }),
    );

    assert.match(html, /Series thanh-kiem-trong-mua/);
    assert.match(
      html,
      /href="\/series\/thanh-kiem-trong-mua\/chapters\/chuong-3"/,
    );
    assert.match(html, /Đọc tiếp/);
    assert.match(html, /chuong-3/);
    assert.match(html, /2026-07-31T09:00:00\.000Z/);
    assert.match(
      html,
      /href="\/series\/den-long-tren-bien-may\/chapters\/chuong-1"/,
    );
    assert.match(html, /Bắt đầu đọc/);
    assert.match(html, /Chưa có tiến độ đọc/);
  });

  it("invites an Anonymous Reader Session to upgrade instead of showing a library", () => {
    const html = renderToStaticMarkup(
      ReaderLibraryView({ session: { kind: "anonymous" } }),
    );

    assert.match(html, /Tạo Reader Account/);
    assert.match(html, /href="\/reader-account\/upgrade"/);
    assert.doesNotMatch(html, /Đọc tiếp/);
  });

  it("explains an empty library instead of rendering nothing", () => {
    const html = renderToStaticMarkup(
      ReaderLibraryView({
        session: { kind: "reader", library: { entries: [] } },
      }),
    );

    assert.match(html, /chưa theo dõi Series nào/i);
  });
});

function publicCatalogSeries(id: string): PublicCatalogSeries {
  return {
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
    firstPublicChapterId: "chuong-1",
  };
}
