import {
  ANONYMOUS_SESSION_HEADER,
  createAnonymousReaderPrincipal,
  createReaderPrincipal,
  READER_ACCOUNT_HEADER,
  type ReaderRequestPrincipal,
} from "@novelx/shared";

/**
 * Resolves the reader-facing principal from request headers. A request without
 * a Reader Account header is an Anonymous Reader Session, which the reader
 * boundary answers with an upgrade prompt for account-only behavior.
 *
 * The headers are trusted as-is: NovelX has no Reader Account authentication
 * yet, so this is a placeholder seam, not an authorization boundary.
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
