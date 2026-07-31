import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  fetchReaderLibraryRequest,
  followSeriesRequest,
  recordProgressRequest,
  unfollowSeriesRequest,
  upgradeToReaderAccountRequest,
} from "./reader-library-client.js";

const originalFetch = globalThis.fetch;

describe("reader calls from the browser", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("follows and unfollows through the same-origin reader routes", async () => {
    const calls = recordFetchCalls({ status: 200, payload: { entries: [] } });

    await followSeriesRequest({ seriesId: "thanh-kiem-trong-mua" });
    await unfollowSeriesRequest({ seriesId: "thanh-kiem-trong-mua" });

    assert.deepEqual(
      calls.map((call) => [call.method, call.url]),
      [
        ["PUT", "/api/reader/library/follows/thanh-kiem-trong-mua"],
        ["DELETE", "/api/reader/library/follows/thanh-kiem-trong-mua"],
      ],
    );
  });

  it("sends no reader identity of its own", async () => {
    const calls = recordFetchCalls({ status: 200, payload: { entries: [] } });

    await fetchReaderLibraryRequest();
    await recordProgressRequest({
      seriesId: "thanh-kiem-trong-mua",
      chapterId: "chuong-1",
      position: 1842,
    });

    for (const call of calls) {
      assert.equal(call.headers.get("authorization"), null);
      assert.equal(call.headers.get("x-novelx-reader-account-id"), null);
    }
    assert.deepEqual(JSON.parse(String(calls[1]?.body)), {
      seriesId: "thanh-kiem-trong-mua",
      chapterId: "chuong-1",
      position: 1842,
    });
  });

  it("reports that the library needs a Reader Account instead of throwing", async () => {
    recordFetchCalls({
      status: 401,
      payload: { error: "reader-account-upgrade-required" },
    });

    assert.deepEqual(await fetchReaderLibraryRequest(), {
      kind: "upgrade-required",
    });
    assert.deepEqual(
      await followSeriesRequest({ seriesId: "thanh-kiem-trong-mua" }),
      { kind: "upgrade-required" },
    );
  });

  it("upgrades to a Reader Account without handling a token", async () => {
    const calls = recordFetchCalls({
      status: 201,
      payload: { readerAccountId: "reader-1" },
    });

    const readerAccountId = await upgradeToReaderAccountRequest();

    assert.equal(readerAccountId, "reader-1");
    assert.deepEqual(
      calls.map((call) => [call.method, call.url]),
      [["POST", "/api/reader/accounts"]],
    );
  });
});

function recordFetchCalls(response: { status: number; payload: unknown }) {
  const calls: {
    method: string;
    url: string;
    headers: Headers;
    body?: BodyInit | null;
  }[] = [];

  globalThis.fetch = async (input, init) => {
    calls.push({
      method: init?.method ?? "GET",
      url: String(input),
      headers: new Headers(init?.headers),
      body: init?.body,
    });

    return new Response(JSON.stringify(response.payload), {
      headers: { "content-type": "application/json" },
      status: response.status,
    });
  };

  return calls;
}
