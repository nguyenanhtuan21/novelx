import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import SeriesPage from "./page.js";

const originalFetch = globalThis.fetch;

describe("public Series page web/API seam", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("server-renders reader-facing Series metadata from the Core Platform API", async () => {
    const requestedUrls: string[] = [];

    globalThis.fetch = async (input) => {
      requestedUrls.push(String(input));

      return new Response(
        JSON.stringify({
          id: "thanh-kiem-trong-mua",
          firstPublicChapterId: "chuong-1",
          title: "Thanh Kiếm Trong Mưa",
          synopsis: "Series kiếm hiệp từ Core Platform API.",
          status: "active",
          creativeDisclosure: "Hybrid",
          taxonomy: {
            genre: "fantasy",
            subgenre: "kiem-hiep",
            tropes: ["hidden-lineage"],
            moods: ["hopeful"],
            themes: ["loyalty"],
            audience: "young-adult",
            ageRating: "13+",
            contentWarnings: ["violence"],
          },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    };

    const html = renderToStaticMarkup(
      await SeriesPage({
        params: Promise.resolve({ seriesId: "thanh-kiem-trong-mua" }),
      }),
    );

    assert.deepEqual(requestedUrls, [
      "http://localhost:3001/catalog/series/thanh-kiem-trong-mua",
    ]);
    assert.match(html, /Thanh Kiếm Trong Mưa/);
    assert.match(html, /Series kiếm hiệp từ Core Platform API\./);
    assert.match(html, /Creative Disclosure/);
    assert.match(html, /Hybrid/);
    assert.match(html, /Trạng thái/);
    assert.match(html, /active/);
    assert.match(html, /Cảnh báo nội dung/);
    assert.match(html, /violence/);
    assert.match(
      html,
      /href="\/series\/thanh-kiem-trong-mua\/chapters\/chuong-1"/,
    );
  });

  it("offers a follow control for the Series", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          id: "thanh-kiem-trong-mua",
          firstPublicChapterId: "chuong-1",
          title: "Thanh Kiếm Trong Mưa",
          synopsis: "Series kiếm hiệp từ Core Platform API.",
          status: "active",
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
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      );

    const html = renderToStaticMarkup(
      await SeriesPage({
        params: Promise.resolve({ seriesId: "thanh-kiem-trong-mua" }),
      }),
    );

    assert.match(html, /data-series-id="thanh-kiem-trong-mua"/);
    assert.match(html, /Theo dõi/);
  });
});
