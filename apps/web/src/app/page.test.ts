import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import HomePage from "./page.js";

const originalFetch = globalThis.fetch;

describe("public Curated Catalog web/API seam", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("server-renders Series catalog cards from the Core Platform API", async () => {
    const requestedUrls: string[] = [];

    globalThis.fetch = async (input) => {
      requestedUrls.push(String(input));

      return new Response(
        JSON.stringify([
          {
            id: "den-long-tren-bien-may",
            firstPublicChapterId: "chuong-mo-dau",
            title: "Đèn Lồng Trên Biển Mây",
            synopsis: "Một Series phiêu lưu được trả về từ Core Platform API.",
            status: "completed",
            creativeDisclosure: "AI-Assisted",
            taxonomy: {
              genre: "adventure",
              subgenre: "sky-pirates",
              tropes: ["found-family"],
              moods: ["wonder"],
              themes: ["belonging"],
              audience: "teen",
              ageRating: "16+",
              contentWarnings: ["peril"],
            },
          },
        ]),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    };

    const html = renderToStaticMarkup(await HomePage());

    assert.deepEqual(requestedUrls, ["http://localhost:3001/catalog/series"]);
    assert.match(html, /Đèn Lồng Trên Biển Mây/);
    assert.match(
      html,
      /Một Series phiêu lưu được trả về từ Core Platform API\./,
    );
    assert.match(html, /completed/);
    assert.match(html, /adventure \/ sky-pirates/);
    assert.match(html, /AI-Assisted/);
    assert.match(
      html,
      /href="\/series\/den-long-tren-bien-may\/chapters\/chuong-mo-dau"/,
    );
  });
});
