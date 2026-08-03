import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import ChapterPage from "./page.js";

const originalFetch = globalThis.fetch;

describe("public Chapter reader web/API seam", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("server-renders prose from a Published Snapshot returned by Core Platform", async () => {
    const requestedUrls: string[] = [];

    globalThis.fetch = async (input) => {
      requestedUrls.push(String(input));

      return new Response(
        JSON.stringify({
          id: "chuong-1:snapshot:2",
          chapterId: "chuong-1",
          seriesId: "thanh-kiem-trong-mua",
          chapterNumber: 1,
          title: "Mùi Mưa Đầu Tiên",
          body: "Snapshot paragraph one.\n\nSnapshot paragraph two from immutable publication.",
          version: 2,
          creativeDisclosure: "AI-Assisted",
          aiPersona: {
            id: "persona-mua-kiem",
            displayName: "May Ke Chuyen Mua Kiem",
            disclosure: "AI-operated creative persona",
            managedContentLineIds: ["thanh-kiem-trong-mua"],
            canAuthenticate: false,
          },
          publishedAt: "2026-07-31T00:00:00.000Z",
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    };

    const html = renderToStaticMarkup(
      await ChapterPage({
        params: Promise.resolve({
          seriesId: "thanh-kiem-trong-mua",
          chapterId: "chuong-1",
        }),
      }),
    );

    assert.deepEqual(requestedUrls, [
      "http://localhost:3001/catalog/series/thanh-kiem-trong-mua/chapters/chuong-1",
    ]);
    assert.match(html, /Snapshot đã xuất bản v2/);
    assert.match(html, /Mùi Mưa Đầu Tiên/);
    assert.match(html, /AI-Assisted/);
    assert.match(html, /May Ke Chuyen Mua Kiem/);
    assert.match(html, /AI-operated creative persona/);
    assert.match(html, /Snapshot paragraph one\./);
    assert.match(html, /Snapshot paragraph two from immutable publication\./);
    assert.doesNotMatch(html, /prov-snapshot-2/);
    assert.doesNotMatch(html, /rights-snapshot-2/);
    assert.doesNotMatch(html, /Mutable draft/);
    assert.doesNotMatch(html, /advertisement|quảng cáo/i);
  });
});
