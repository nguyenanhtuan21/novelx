import type { ReaderLibrary, ReaderLibraryEntry } from "@novelx/shared";
import Link from "next/link";
import React from "react";

export type ReaderLibrarySession =
  { kind: "reader"; library: ReaderLibrary } | { kind: "anonymous" };

export function ReaderLibraryView({
  session,
}: {
  session: ReaderLibrarySession;
}) {
  if (session.kind === "anonymous") {
    return (
      <main className="shell">
        <section className="upgrade-prompt" aria-labelledby="library-title">
          <p className="eyebrow">Thư viện NovelX</p>
          <h1 id="library-title">Thư viện cần Reader Account</h1>
          <p className="lede">
            Phiên đọc ẩn danh giữ được tiến độ đọc, nhưng theo dõi Series và thư
            viện cá nhân cần một Reader Account.
          </p>
          <Link className="read-link" href="/reader-account/upgrade">
            Tạo Reader Account và giữ nguyên tiến độ
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="library" aria-labelledby="library-title">
        <p className="eyebrow">Thư viện NovelX</p>
        <h1 id="library-title">Series bạn đang theo dõi</h1>
        {session.library.entries.length === 0 ? (
          <p className="lede">
            Bạn chưa theo dõi Series nào. Mở một Series trong catalog và bấm
            Theo dõi để đưa vào thư viện.
          </p>
        ) : (
          <ol className="library-list">
            {session.library.entries.map((entry) => (
              <li className="library-entry" key={entry.series.id}>
                <LibraryEntry entry={entry} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function LibraryEntry({ entry }: { entry: ReaderLibraryEntry }) {
  const { series, continueReading } = entry;
  const nextChapterId =
    continueReading?.chapterId ?? series.firstPublicChapterId;

  return (
    <article>
      <p className="badge">{series.creativeDisclosure}</p>
      <h2>
        <Link href={`/series/${series.id}`}>{series.title}</Link>
      </h2>
      <p>{series.synopsis}</p>
      <dl>
        <div>
          <dt>Tiến độ đọc</dt>
          <dd>
            {continueReading ? (
              <>
                Chương {continueReading.chapterId}, đã lưu lúc{" "}
                <time dateTime={continueReading.updatedAt}>
                  {continueReading.updatedAt}
                </time>
              </>
            ) : (
              "Chưa có tiến độ đọc"
            )}
          </dd>
        </div>
      </dl>
      {nextChapterId ? (
        <Link
          className="read-link"
          href={`/series/${series.id}/chapters/${nextChapterId}`}
        >
          {continueReading ? "Đọc tiếp" : "Bắt đầu đọc"}
        </Link>
      ) : (
        <p>Series chưa có chương công khai.</p>
      )}
    </article>
  );
}
