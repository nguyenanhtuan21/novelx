import {
  createAnonymousReaderPrincipal,
  createReaderPrincipal,
  type ReaderRequestPrincipal,
} from "@novelx/shared";

export const READER_ACCOUNT_HEADER = "x-novelx-reader-account-id";
export const ANONYMOUS_SESSION_HEADER = "x-novelx-anonymous-session-id";

/**
 * Resolves the reader-facing principal from request headers. A request without
 * a Reader Account header is an Anonymous Reader Session, which the reader
 * boundary answers with an upgrade prompt for account-only behavior.
 */
export function readerRequestPrincipal(
  headers: Record<string, string | string[] | undefined>,
): ReaderRequestPrincipal {
  const readerAccountId = singleHeader(headers[READER_ACCOUNT_HEADER]);

  if (readerAccountId) {
    return createReaderPrincipal({ readerAccountId });
  }

  return createAnonymousReaderPrincipal({
    anonymousSessionId: singleHeader(headers[ANONYMOUS_SESSION_HEADER]),
  });
}

function singleHeader(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}
