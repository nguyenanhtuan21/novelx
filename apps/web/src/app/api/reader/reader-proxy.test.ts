import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { readerProxy } from "./reader-proxy.js";

const originalFetch = globalThis.fetch;

describe("reader proxy to Core Platform", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("forwards the reader session token and returns what Core Platform said", async () => {
    const calls = recordFetchCalls([{ status: 200, payload: { entries: [] } }]);

    const result = await readerProxy({
      token: "session-token-1",
      method: "GET",
      path: "/reader/library",
    });

    assert.deepEqual(
      calls.map((call) => [call.method, call.url]),
      [["GET", "http://localhost:3001/reader/library"]],
    );
    assert.equal(
      calls[0]?.headers.get("authorization"),
      "Bearer session-token-1",
    );
    assert.deepEqual(result, { status: 200, body: { entries: [] } });
  });

  it("starts an Anonymous Reader Session when the reader holds no token", async () => {
    const calls = recordFetchCalls([
      { status: 201, payload: { token: "session-token-new" } },
      { status: 200, payload: { seriesId: "s", chapterId: "c", position: 1 } },
    ]);

    const result = await readerProxy({
      token: undefined,
      method: "PUT",
      path: "/reader/progress",
      body: { seriesId: "s", chapterId: "c", position: 1 },
      startSession: true,
    });

    assert.deepEqual(
      calls.map((call) => [call.method, call.url]),
      [
        ["POST", "http://localhost:3001/reader/sessions"],
        ["PUT", "http://localhost:3001/reader/progress"],
      ],
    );
    assert.equal(
      calls[1]?.headers.get("authorization"),
      "Bearer session-token-new",
    );
    assert.equal(result.token, "session-token-new");
    assert.equal(result.status, 200);
  });

  it("keeps an upgraded Reader Account token out of the browser response", async () => {
    recordFetchCalls([
      {
        status: 201,
        payload: { readerAccountId: "reader-1", token: "session-token-reader" },
      },
    ]);

    const result = await readerProxy({
      token: "session-token-anon",
      method: "POST",
      path: "/reader/accounts",
    });

    assert.deepEqual(result.body, { readerAccountId: "reader-1" });
    assert.equal(result.token, "session-token-reader");
  });

  it("passes an upgrade prompt straight back to the caller", async () => {
    recordFetchCalls([
      {
        status: 401,
        payload: { error: "reader-account-upgrade-required" },
      },
    ]);

    const result = await readerProxy({
      token: "session-token-anon",
      method: "GET",
      path: "/reader/library",
    });

    assert.equal(result.status, 401);
    assert.deepEqual(result.body, { error: "reader-account-upgrade-required" });
    assert.equal(result.token, undefined);
  });
});

function recordFetchCalls(
  responses: { status: number; payload: unknown }[],
): { method: string; url: string; headers: Headers }[] {
  const calls: { method: string; url: string; headers: Headers }[] = [];

  globalThis.fetch = async (input, init) => {
    calls.push({
      method: init?.method ?? "GET",
      url: String(input),
      headers: new Headers(init?.headers),
    });
    const next = responses[calls.length - 1];

    return new Response(JSON.stringify(next?.payload ?? {}), {
      headers: { "content-type": "application/json" },
      status: next?.status ?? 200,
    });
  };

  return calls;
}
