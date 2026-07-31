import { READER_ACCOUNT_HEADER, type ReaderLibrary } from "@novelx/shared";

import { fetchCorePlatformJson } from "../core-platform-api";

export async function fetchReaderLibrary(
  readerAccountId: string,
): Promise<ReaderLibrary> {
  return fetchCorePlatformJson<ReaderLibrary>(
    "/reader/library",
    "Reader Account library",
    { headers: { [READER_ACCOUNT_HEADER]: readerAccountId } },
  );
}
