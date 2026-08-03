import type { ReaderLibrary, ReadingProgress } from "@novelx/shared";

/**
 * Browser-side reader calls. They go to same-origin `/api/reader` routes, which
 * hold the reader session token in an HttpOnly cookie — the page never sees or
 * sends an identity of its own.
 */
export type ReaderLibraryResult =
  { kind: "reader"; library: ReaderLibrary } | { kind: "upgrade-required" };

export async function fetchReaderLibraryRequest(): Promise<ReaderLibraryResult> {
  const response = await fetch("/api/reader/library", { cache: "no-store" });

  if (response.status === 401) {
    return { kind: "upgrade-required" };
  }

  return { kind: "reader", library: await readerJson<ReaderLibrary>(response) };
}

export async function followSeriesRequest(input: {
  seriesId: string;
}): Promise<ReaderLibraryResult> {
  return followRequest("PUT", input.seriesId);
}

export async function unfollowSeriesRequest(input: {
  seriesId: string;
}): Promise<ReaderLibraryResult> {
  return followRequest("DELETE", input.seriesId);
}

export async function recordProgressRequest(input: {
  seriesId: string;
  chapterId: string;
  position: number;
}): Promise<ReadingProgress> {
  const response = await fetch("/api/reader/progress", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  return readerJson<ReadingProgress>(response);
}

/**
 * Reports a chunk of engaged reading time, which is what Weekly Engaged Reading
 * Hours is built from. The reporter batches this on a time interval rather than
 * firing per-scroll, so the metric measures reading rather than how often the
 * page fired.
 */
export async function recordEngagementRequest(input: {
  seriesId: string;
  chapterId: string;
  engagedSeconds: number;
  position: number;
}): Promise<void> {
  const response = await fetch("/api/reader/engagement", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Reader engagement request failed: ${response.status}`);
  }
}

export async function upgradeToReaderAccountRequest(): Promise<string> {
  const response = await fetch("/api/reader/accounts", { method: "POST" });
  const upgraded = await readerJson<{ readerAccountId: string }>(response);

  return upgraded.readerAccountId;
}

async function followRequest(
  method: "PUT" | "DELETE",
  seriesId: string,
): Promise<ReaderLibraryResult> {
  const response = await fetch(
    `/api/reader/library/follows/${encodeURIComponent(seriesId)}`,
    { method },
  );

  if (response.status === 401) {
    return { kind: "upgrade-required" };
  }

  return { kind: "reader", library: await readerJson<ReaderLibrary>(response) };
}

async function readerJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Reader request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}
