import { cookies } from "next/headers";
import React from "react";

import { READER_SESSION_COOKIE } from "../reader-session";
import { ReaderLibraryView } from "./library-view";
import { fetchReaderLibrary } from "./reader-library-api";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const token = (await cookies()).get(READER_SESSION_COOKIE)?.value;
  const library = token ? await fetchReaderLibrary(token) : "upgrade-required";

  if (library === "upgrade-required") {
    return <ReaderLibraryView session={{ kind: "anonymous" }} />;
  }

  return <ReaderLibraryView session={{ kind: "reader", library }} />;
}
