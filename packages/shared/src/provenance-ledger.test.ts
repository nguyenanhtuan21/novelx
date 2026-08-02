import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  amendCanon,
  attachWorkflowMaterial,
  authorChapterDraft,
  chapterDraftProvenance,
  clearMaterialForWorkflowUse,
  createAiWorkflowPrincipal,
  createProvenanceEntry,
  createRightsRecord,
  createSeries,
  createStaffPrincipal,
  createStoryBible,
  lockStoryBible,
  provenanceSource,
  publishedSnapshotProvenance,
  seriesProvenance,
  storyBibleProvenance,
  type ChapterDraft,
  type ManagedTaxonomy,
  type ProvenanceEntry,
  type PublishedSnapshot,
  type Series,
  type StoryBible,
} from "./index.js";

const editor = createStaffPrincipal({
  staffAccountId: "staff-editor-1",
  permissions: ["series:write", "canon:write", "chapter:write", "rights:write"],
});

const workflowRun = createAiWorkflowPrincipal({
  workspaceId: "novelx",
  workflowRunId: "run-2026-08-01-1",
});

const taxonomy: ManagedTaxonomy = {
  genre: "fantasy",
  subgenre: "kiem-hiep",
  tropes: ["hidden-lineage"],
  moods: ["hopeful"],
  themes: ["loyalty"],
  audience: "young-adult",
  ageRating: "13+",
  contentWarnings: ["violence"],
};

describe("a Provenance Ledger entry", () => {
  it("keeps who acted, what they did, what it was about, and when", () => {
    const entry = provenanceEntry();

    assert.equal(entry.id, "provenance-1");
    assert.deepEqual(entry.source, {
      kind: "staff",
      staffAccountId: "staff-editor-1",
    });
    assert.equal(entry.action, "chapter-draft.author");
    assert.deepEqual(entry.target, {
      kind: "chapter-draft",
      id: "chuong-1",
      seriesId: "series-1",
    });
    assert.equal(entry.recordedAt, "2026-08-01T10:00:00.000Z");
  });

  /**
   * Lineage has to name an AI workflow run as itself. An entry that credited a
   * run to whichever Staff Account started it would lose the one fact the
   * ledger exists to keep about AI-assisted content.
   */
  it("names an AI workflow run as its own source", () => {
    const entry = provenanceEntry({ source: provenanceSource(workflowRun) });

    assert.deepEqual(entry.source, {
      kind: "ai-workflow",
      workspaceId: "novelx",
      workflowRunId: "run-2026-08-01-1",
    });
  });

  it("refuses an entry that names no action, no target, or no Series", () => {
    const subject = chapterDraftProvenance(draftChapter());

    for (const incomplete of [
      { action: " " },
      { subject: { ...subject, target: { ...subject.target, id: " " } } },
      { subject: { ...subject, target: { ...subject.target, seriesId: "" } } },
      { id: "  " },
    ]) {
      assert.throws(
        () => provenanceEntry(incomplete),
        /Provenance Ledger entry needs an id, an action, and the artifact it traces/,
        JSON.stringify(incomplete),
      );
    }
  });

  /**
   * The version context is what the traced artifact was at that moment, so it
   * has to describe that artifact. Version context from something else is a
   * lineage that points at the wrong content, which is worse than none.
   */
  it("refuses version context that describes another kind of artifact", () => {
    const draft = chapterDraftProvenance(draftChapter());
    const series = seriesProvenance(governedSeries());

    assert.throws(
      () =>
        provenanceEntry({
          subject: { target: draft.target, version: series.version },
        }),
      /version context describes a series, not a chapter-draft/,
    );
  });

  it("cannot be edited once it is written", () => {
    const entry = provenanceEntry();

    assert.throws(() => {
      (entry as { action: string }).action = "chapter-draft.delete";
    });
  });
});

describe("the version context of a traced artifact", () => {
  it("names a Series by the state readers would see it in", () => {
    const { target, version } = seriesProvenance(governedSeries());

    assert.deepEqual(target, {
      kind: "series",
      id: "series-1",
      seriesId: "series-1",
    });
    assert.deepEqual(version, {
      kind: "series",
      status: "draft",
      creativeDisclosure: "Hybrid",
    });
  });

  /**
   * Canon entry ids rather than the statements themselves: the ledger says
   * which canon an action produced, and the Story Bible holds the canon.
   */
  it("names the Canon a Story Bible held, and whether it was locked", () => {
    const { target, version } = storyBibleProvenance(storyBible());

    assert.deepEqual(target, {
      kind: "story-bible",
      id: "series-1",
      seriesId: "series-1",
    });
    assert.deepEqual(version, {
      kind: "story-bible",
      canonEntryIds: ["canon-1"],
      locked: false,
    });
  });

  it("names a Story Bible that has been put into production use", () => {
    const locked = lockStoryBible({
      storyBible: storyBible(),
      actor: editor,
      lockedAt: "2026-08-01T09:00:00.000Z",
    });

    assert.deepEqual(storyBibleProvenance(locked).version, {
      kind: "story-bible",
      canonEntryIds: ["canon-1"],
      locked: true,
    });
  });

  /**
   * Which Rights Records cleared the material a draft carries is the lineage
   * question a later Quality Gate asks, so the entry reads it off the draft
   * rather than leaving it to be re-derived.
   */
  it("names the Rights Records that cleared a draft Chapter's material", () => {
    const { target, version } = chapterDraftProvenance(draftWithMaterial());

    assert.deepEqual(target, {
      kind: "chapter-draft",
      id: "chuong-1",
      seriesId: "series-1",
    });
    assert.deepEqual(version, {
      kind: "chapter-draft",
      chapterNumber: 1,
      rightsRecordIds: ["rights-1"],
    });
  });

  it("names a fresh draft Chapter as carrying no cleared material at all", () => {
    assert.deepEqual(chapterDraftProvenance(draftChapter()).version, {
      kind: "chapter-draft",
      chapterNumber: 1,
      rightsRecordIds: [],
    });
  });

  it("names which version of a Chapter a publish operation made public", () => {
    const { target, version } = publishedSnapshotProvenance(snapshot());

    assert.deepEqual(target, {
      kind: "published-snapshot",
      id: "chuong-1:snapshot:2",
      seriesId: "series-1",
    });
    assert.deepEqual(version, {
      kind: "published-snapshot",
      chapterId: "chuong-1",
      version: 2,
    });
  });
});

function provenanceEntry(
  changes: Partial<Parameters<typeof createProvenanceEntry>[0]> = {},
): ProvenanceEntry {
  return createProvenanceEntry({
    id: "provenance-1",
    source: provenanceSource(editor),
    action: "chapter-draft.author",
    subject: chapterDraftProvenance(draftChapter()),
    recordedAt: "2026-08-01T10:00:00.000Z",
    ...changes,
  });
}

function governedSeries(): Series {
  return createSeries({
    id: "series-1",
    title: "Thanh Kiếm Trong Mưa",
    synopsis: "Một series tiên hiệp trong catalog tuyển chọn của NovelX.",
    creativeDisclosure: "Hybrid",
    taxonomy,
  });
}

function storyBible(): StoryBible {
  return amendCanon({
    storyBible: createStoryBible({ seriesId: "series-1", actor: editor }),
    canon: [{ id: "canon-1", statement: "Mưa Ngâu chỉ rơi vào tháng bảy." }],
    actor: editor,
  });
}

function draftChapter(): ChapterDraft {
  return authorChapterDraft({
    id: "chuong-1",
    series: governedSeries(),
    chapterNumber: 1,
    title: "Mùi Mưa Đầu Tiên",
    body: "Mưa rơi trên mái ngõ.",
  });
}

function draftWithMaterial(): ChapterDraft {
  const material = { id: "asset-cover-illustration-1", kind: "asset" } as const;

  return attachWorkflowMaterial({
    draft: draftChapter(),
    attachment: clearMaterialForWorkflowUse({
      material,
      use: "ai-workflow",
      rightsRecord: createRightsRecord({
        id: "rights-1",
        material,
        owner: "Studio Mưa Ngâu",
        scope: ["ai-workflow"],
        territories: ["VN"],
        duration: { from: "2026-01-01T00:00:00.000Z" },
        modificationAllowed: true,
        aiUseAllowed: true,
        evidence: { kind: "signed-licence", reference: "contract-2026-014" },
        actor: editor,
        recordedAt: "2026-08-01T08:00:00.000Z",
      }),
      territory: "VN",
      usedAt: "2026-08-01T09:30:00.000Z",
    }),
  });
}

function snapshot(): PublishedSnapshot {
  return Object.freeze({
    id: "chuong-1:snapshot:2",
    chapterId: "chuong-1",
    seriesId: "series-1",
    chapterNumber: 1,
    title: "Mùi Mưa Đầu Tiên",
    body: "Mưa rơi trên mái ngõ.",
    version: 2,
    creativeDisclosure: "Hybrid",
    provenanceLedgerEntryId: "provenance-1",
    rightsRecordIds: ["rights-1"],
    publishedAt: "2026-08-02T10:00:00.000Z",
    publishedByStaffAccountId: "staff-editor-1",
  });
}
