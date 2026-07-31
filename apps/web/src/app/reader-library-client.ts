import {
  ANONYMOUS_SESSION_HEADER,
  READER_ACCOUNT_HEADER,
  type ReaderLibrary,
  type ReadingProgress,
} from "@novelx/shared";

import {
  ANONYMOUS_SESSION_COOKIE,
  READER_ACCOUNT_COOKIE,
} from "./reader-session";

/** Browser-visible Core Platform origin; the server-only base URL is not exposed to clients. */
const corePlatformApiUrl =
  process.env.NEXT_PUBLIC_CORE_PLATFORM_API_URL ?? "http://localhost:3001";

export type ReaderSessionCookies = {
  readerAccountId?: string;
  anonymousSessionId?: string;
};

export function readerSessionFromCookie(cookie: string): ReaderSessionCookies {
  const jar = new Map(
    cookie
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf("=");

        return [
          entry.slice(0, separator),
          decodeURIComponent(entry.slice(separator + 1)),
        ] as const;
      }),
  );

  return {
    ...(jar.get(READER_ACCOUNT_COOKIE)
      ? { readerAccountId: jar.get(READER_ACCOUNT_COOKIE) }
      : {}),
    ...(jar.get(ANONYMOUS_SESSION_COOKIE)
      ? { anonymousSessionId: jar.get(ANONYMOUS_SESSION_COOKIE) }
      : {}),
  };
}

const READER_SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function ensureAnonymousSessionId(
  cookie: string,
  newAnonymousSessionId: () => string,
): string {
  return (
    readerSessionFromCookie(cookie).anonymousSessionId ??
    newAnonymousSessionId()
  );
}

export function readerAccountCookieValue(readerAccountId: string): string {
  return sessionCookieValue(READER_ACCOUNT_COOKIE, readerAccountId);
}

export function anonymousSessionCookieValue(
  anonymousSessionId: string,
): string {
  return sessionCookieValue(ANONYMOUS_SESSION_COOKIE, anonymousSessionId);
}

function sessionCookieValue(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; path=/; max-age=${READER_SESSION_COOKIE_MAX_AGE}; samesite=lax`;
}

export async function fetchReaderLibraryRequest(input: {
  readerAccountId: string;
}): Promise<ReaderLibrary> {
  return readerRequest<ReaderLibrary>({
    method: "GET",
    path: "/reader/library",
    headers: { [READER_ACCOUNT_HEADER]: input.readerAccountId },
  });
}

export async function followSeriesRequest(input: {
  seriesId: string;
  readerAccountId: string;
}): Promise<ReaderLibrary> {
  return readerRequest<ReaderLibrary>({
    method: "PUT",
    path: `/reader/library/follows/${encodeURIComponent(input.seriesId)}`,
    headers: { [READER_ACCOUNT_HEADER]: input.readerAccountId },
  });
}

export async function unfollowSeriesRequest(input: {
  seriesId: string;
  readerAccountId: string;
}): Promise<ReaderLibrary> {
  return readerRequest<ReaderLibrary>({
    method: "DELETE",
    path: `/reader/library/follows/${encodeURIComponent(input.seriesId)}`,
    headers: { [READER_ACCOUNT_HEADER]: input.readerAccountId },
  });
}

/**
 * Reading progress is allowed before a Reader Account exists, so this reports
 * against whichever reader session the browser currently holds.
 */
export async function recordProgressRequest(input: {
  session: ReaderSessionCookies;
  seriesId: string;
  chapterId: string;
  position: number;
}): Promise<ReadingProgress> {
  const { readerAccountId, anonymousSessionId } = input.session;

  return readerRequest<ReadingProgress>({
    method: "PUT",
    path: "/reader/progress",
    headers: readerAccountId
      ? { [READER_ACCOUNT_HEADER]: readerAccountId }
      : { [ANONYMOUS_SESSION_HEADER]: anonymousSessionId ?? "" },
    body: {
      seriesId: input.seriesId,
      chapterId: input.chapterId,
      position: input.position,
    },
  });
}

export async function upgradeToReaderAccountRequest(input: {
  anonymousSessionId: string;
}): Promise<string> {
  const upgraded = await readerRequest<{ readerAccountId: string }>({
    method: "POST",
    path: "/reader/accounts",
    headers: { [ANONYMOUS_SESSION_HEADER]: input.anonymousSessionId },
  });

  return upgraded.readerAccountId;
}

async function readerRequest<T>(input: {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
}): Promise<T> {
  const response = await fetch(`${corePlatformApiUrl}${input.path}`, {
    method: input.method,
    headers: input.body
      ? { ...input.headers, "content-type": "application/json" }
      : input.headers,
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });

  if (!response.ok) {
    throw new Error(`Core Platform reader request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}
