import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  anonymousSessionCookieValue,
  ensureAnonymousSessionId,
  fetchReaderLibraryRequest,
  followSeriesRequest,
  readerAccountCookieValue,
  recordProgressRequest,
  readerSessionFromCookie,
  unfollowSeriesRequest,
  upgradeToReaderAccountRequest,
} from "./reader-library-client.js";

const originalFetch = globalThis.fetch;

describe("reader session cookies", () => {
  it("reads the Reader Account and Anonymous Reader Session ids", () => {
    const session = readerSessionFromCookie(
      "theme=paper; novelx-reader-account-id=reader-1; novelx-anonymous-session-id=anon-1",
    );

    assert.deepEqual(session, {
      readerAccountId: "reader-1",
      anonymousSessionId: "anon-1",
    });
  });

  it("reports no Reader Account for a reader who has not upgraded", () => {
    const session = readerSessionFromCookie(
      "novelx-anonymous-session-id=anon-1",
    );

    assert.equal(session.readerAccountId, undefined);
    assert.equal(session.anonymousSessionId, "anon-1");
  });
});

describe("upgrading an Anonymous Reader Session", () => {
  it("reuses the existing session id so progress is not orphaned", () => {
    const existing = ensureAnonymousSessionId(
      "novelx-anonymous-session-id=anon-1",
      () => "anon-new",
    );
    const created = ensureAnonymousSessionId("theme=paper", () => "anon-new");

    assert.equal(existing, "anon-1");
    assert.equal(created, "anon-new");
  });

  it("writes reader session cookies scoped to the whole site", () => {
    assert.match(
      readerAccountCookieValue("reader-1"),
      /^novelx-reader-account-id=reader-1; path=\/; max-age=\d+; samesite=lax$/,
    );
    assert.match(
      anonymousSessionCookieValue("anon-1"),
      /^novelx-anonymous-session-id=anon-1; path=\/; max-age=\d+; samesite=lax$/,
    );
  });
});

describe("follow and unfollow through the reader boundary", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends the follow and unfollow calls as the Reader Account", async () => {
    const calls = recordFetchCalls({ entries: [] });

    await followSeriesRequest({
      seriesId: "thanh-kiem-trong-mua",
      readerAccountId: "reader-1",
    });
    await unfollowSeriesRequest({
      seriesId: "thanh-kiem-trong-mua",
      readerAccountId: "reader-1",
    });

    assert.deepEqual(
      calls.map((call) => [call.method, call.url]),
      [
        [
          "PUT",
          "http://localhost:3001/reader/library/follows/thanh-kiem-trong-mua",
        ],
        [
          "DELETE",
          "http://localhost:3001/reader/library/follows/thanh-kiem-trong-mua",
        ],
      ],
    );
    assert.equal(
      calls[0]?.headers.get("x-novelx-reader-account-id"),
      "reader-1",
    );
  });

  it("reads the current library so the follow control knows its state", async () => {
    const calls = recordFetchCalls({
      entries: [{ series: { id: "thanh-kiem-trong-mua" }, followedAt: "x" }],
    });

    const library = await fetchReaderLibraryRequest({
      readerAccountId: "reader-1",
    });

    assert.deepEqual(
      calls.map((call) => [call.method, call.url]),
      [["GET", "http://localhost:3001/reader/library"]],
    );
    assert.equal(
      calls[0]?.headers.get("x-novelx-reader-account-id"),
      "reader-1",
    );
    assert.equal(library.entries[0]?.series.id, "thanh-kiem-trong-mua");
  });

  it("reports reading progress as the Reader Account when there is one", async () => {
    const calls = recordFetchCalls({
      seriesId: "thanh-kiem-trong-mua",
      chapterId: "chuong-1",
      position: 1842,
      updatedAt: "2026-07-31T09:00:00.000Z",
    });

    await recordProgressRequest({
      session: { readerAccountId: "reader-1", anonymousSessionId: "anon-1" },
      seriesId: "thanh-kiem-trong-mua",
      chapterId: "chuong-1",
      position: 1842,
    });

    assert.deepEqual(
      calls.map((call) => [call.method, call.url]),
      [["PUT", "http://localhost:3001/reader/progress"]],
    );
    assert.equal(
      calls[0]?.headers.get("x-novelx-reader-account-id"),
      "reader-1",
    );
    assert.equal(calls[0]?.headers.get("x-novelx-anonymous-session-id"), null);
    assert.deepEqual(JSON.parse(String(calls[0]?.body)), {
      seriesId: "thanh-kiem-trong-mua",
      chapterId: "chuong-1",
      position: 1842,
    });
  });

  it("reports reading progress against the Anonymous Reader Session before upgrade", async () => {
    const calls = recordFetchCalls({});

    await recordProgressRequest({
      session: { anonymousSessionId: "anon-1" },
      seriesId: "thanh-kiem-trong-mua",
      chapterId: "chuong-1",
      position: 12,
    });

    assert.equal(
      calls[0]?.headers.get("x-novelx-anonymous-session-id"),
      "anon-1",
    );
    assert.equal(calls[0]?.headers.get("x-novelx-reader-account-id"), null);
  });

  it("upgrades an Anonymous Reader Session into a Reader Account", async () => {
    const calls = recordFetchCalls({ readerAccountId: "reader-upgraded-1" });

    const readerAccountId = await upgradeToReaderAccountRequest({
      anonymousSessionId: "anon-1",
    });

    assert.equal(readerAccountId, "reader-upgraded-1");
    assert.deepEqual(
      calls.map((call) => [call.method, call.url]),
      [["POST", "http://localhost:3001/reader/accounts"]],
    );
    assert.equal(
      calls[0]?.headers.get("x-novelx-anonymous-session-id"),
      "anon-1",
    );
  });
});

function recordFetchCalls(payload: unknown) {
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

    return new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };

  return calls;
}
