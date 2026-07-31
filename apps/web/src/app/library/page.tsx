import { cookies } from "next/headers";
import React from "react";

import { READER_ACCOUNT_COOKIE } from "../reader-session";
import { ReaderLibraryView } from "./library-view";
import { fetchReaderLibrary } from "./reader-library-api";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const readerAccountId = (await cookies()).get(READER_ACCOUNT_COOKIE)?.value;

  if (!readerAccountId) {
    return <ReaderLibraryView session={{ kind: "anonymous" }} />;
  }

  return (
    <ReaderLibraryView
      session={{
        kind: "reader",
        library: await fetchReaderLibrary(readerAccountId),
      }}
    />
  );
}
