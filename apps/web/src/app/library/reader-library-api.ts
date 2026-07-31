import type { ReaderLibrary } from "@novelx/shared";

import { fetchCorePlatformJson } from "../core-platform-api";
import { READER_ACCOUNT_HEADER } from "../reader-session";

export async function fetchReaderLibrary(
  readerAccountId: string,
): Promise<ReaderLibrary> {
  return fetchCorePlatformJson<ReaderLibrary>(
    "/reader/library",
    "Reader Account library",
    { headers: { [READER_ACCOUNT_HEADER]: readerAccountId } },
  );
}
