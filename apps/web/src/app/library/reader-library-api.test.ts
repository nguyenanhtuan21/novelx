import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { fetchReaderLibrary } from "./reader-library-api.js";

const originalFetch = globalThis.fetch;

describe("Reader Account library web/API seam", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("asks Core Platform for the library as the signed-in Reader Account", async () => {
    const calls: { url: string; headers: Headers }[] = [];

    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers) });

      return new Response(JSON.stringify({ entries: [] }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    };

    const library = await fetchReaderLibrary("reader-1");

    assert.deepEqual(
      calls.map((call) => call.url),
      ["http://localhost:3001/reader/library"],
    );
    assert.equal(
      calls[0]?.headers.get("x-novelx-reader-account-id"),
      "reader-1",
    );
    assert.deepEqual(library.entries, []);
  });
});
