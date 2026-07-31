import {
  createChapterDraft,
  createSeries,
  createStaffPrincipal,
  publishChapter,
} from "@novelx/shared";

import { ReaderControls } from "./reader-controls";

const series = createSeries({
  id: "thanh-kiem-trong-mua",
  title: "Thanh Kiếm Trong Mưa",
  synopsis: "Kiếm hiệp Việt Nam trong catalog tuyển chọn của NovelX.",
  creativeDisclosure: "Hybrid",
  taxonomy: {
    genre: "fantasy",
    subgenre: "kiem-hiep",
    tropes: ["hidden-lineage"],
    moods: ["hopeful"],
    themes: ["loyalty"],
    audience: "young-adult",
    ageRating: "13+",
    contentWarnings: ["violence"],
  },
  status: "active",
});

const chapter = publishChapter({
  series,
  draft: createChapterDraft({
    id: "chuong-1",
    seriesId: series.id,
    chapterNumber: 1,
    title: "Mùi Mưa Đầu Tiên",
    body: "Mưa rơi trên mái ngõ. Người giữ cổng thành mở phong thư cũ, thấy dấu son của một lời thề từ năm cũ.",
    creativeDisclosure: "Hybrid",
    rightsRecordId: "rights-seed-1",
    provenanceLedgerEntryId: "prov-seed-1",
    qualityGate: {
      canonContinuity: "pass",
      policySafety: "pass",
      originalityIp: "pass",
      metadata: "pass",
      rightsRecord: "pass",
      provenanceLedger: "pass",
      humanApproval: "pass",
    },
    humanApproval: {
      reviewerStaffAccountId: "staff-seed-editor",
      approvedAt: "2026-07-31T00:00:00.000Z",
    },
  }),
  actor: createStaffPrincipal({
    staffAccountId: "staff-seed-editor",
    permissions: ["chapter:publish"],
  }),
  publishedAt: "2026-07-31T00:00:00.000Z",
});

export default function ChapterPage() {
  return (
    <main className="reader-shell">
      <header className="reader-header">
        <p className="eyebrow">Snapshot đã xuất bản v{chapter.version}</p>
        <h1>{chapter.title}</h1>
        <p>
          Công khai AI: <strong>{chapter.creativeDisclosure}</strong>. Độ tuổi:{" "}
          {series.taxonomy.ageRating}.
        </p>
      </header>
      <ReaderControls />
      <article className="prose" data-chapter-id={chapter.chapterId}>
        {chapter.body.split(". ").map((paragraph) => (
          <p key={paragraph}>{paragraph}.</p>
        ))}
      </article>
    </main>
  );
}
