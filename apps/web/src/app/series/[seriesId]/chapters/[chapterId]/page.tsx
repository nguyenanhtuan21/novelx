import type { PublishedSnapshot } from "@novelx/shared";
import React from "react";

import { fetchPublicCorePlatformJson } from "../../../../core-platform-api";
import { ReaderControls } from "./reader-controls";

export const dynamic = "force-dynamic";

type ChapterPageProps = {
  params: Promise<{ seriesId: string; chapterId: string }>;
};

async function fetchPublicChapter(input: {
  seriesId: string;
  chapterId: string;
}): Promise<PublishedSnapshot> {
  return fetchPublicCorePlatformJson<PublishedSnapshot>(
    `/catalog/series/${input.seriesId}/chapters/${input.chapterId}`,
    "Chapter",
  );
}

export default async function ChapterPage({ params }: ChapterPageProps) {
  const { seriesId, chapterId } = await params;
  const chapter = await fetchPublicChapter({ seriesId, chapterId });
  const paragraphs = chapter.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <main className="reader-shell">
      <header className="reader-header">
        <p className="eyebrow">Snapshot đã xuất bản v{chapter.version}</p>
        <h1>{chapter.title}</h1>
        <p>
          Công khai AI: <strong>{chapter.creativeDisclosure}</strong>.
        </p>
      </header>
      <ReaderControls />
      <article className="prose" data-chapter-id={chapter.chapterId}>
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </article>
    </main>
  );
}
