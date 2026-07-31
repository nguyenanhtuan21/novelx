import type { ReaderLibrary } from "@novelx/shared";

import {
  CorePlatformRequestError,
  fetchCorePlatformJson,
} from "../core-platform-api";

/**
 * Reads the library for the reader session token held server-side. A session
 * that has not become a Reader Account gets the upgrade prompt, not a library.
 */
export async function fetchReaderLibrary(
  token: string,
): Promise<ReaderLibrary | "upgrade-required"> {
  try {
    return await fetchCorePlatformJson<ReaderLibrary>(
      "/reader/library",
      "Reader Account library",
      { headers: { authorization: `Bearer ${token}` } },
    );
  } catch (error) {
    if (error instanceof CorePlatformRequestError && error.status === 401) {
      return "upgrade-required";
    }

    throw error;
  }
}
