import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  authorChapterDraft,
  createSeries,
  createStaffPrincipal,
  publishChapter,
  updateSeries,
  type ManagedTaxonomy,
  type Series,
} from "./index.js";

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

describe("Series metadata", () => {
  it("updates the metadata an editor may change and leaves the rest alone", () => {
    const updated = updateSeries({
      series: governedSeries(),
      changes: {
        title: "Thanh Kiếm Trong Mưa (bản hiệu đính)",
        status: "active",
      },
    });

    assert.equal(updated.id, "series-1");
    assert.equal(updated.title, "Thanh Kiếm Trong Mưa (bản hiệu đính)");
    assert.equal(updated.status, "active");
    assert.deepEqual(updated.taxonomy, taxonomy);
  });

  it("holds an updated Series to the Managed Taxonomy the catalog needs", () => {
    assert.throws(
      () =>
        updateSeries({
          series: governedSeries(),
          changes: { taxonomy: { ...taxonomy, genre: "" } },
        }),
      /Managed Taxonomy requires genre, subgenre, audience, and age rating/,
    );
  });

  it("refuses an update that drops a governed dimension instead of emptying it", () => {
    const { contentWarnings, ...withoutWarnings } = taxonomy;
    assert.deepEqual(contentWarnings, ["violence"]);

    assert.throws(
      () =>
        updateSeries({
          series: governedSeries(),
          changes: { taxonomy: withoutWarnings as ManagedTaxonomy },
        }),
      /Managed Taxonomy needs contentWarnings as a list of governed values/,
    );
  });

  it("does not mutate the Series it was given", () => {
    const before = governedSeries();

    updateSeries({ series: before, changes: { status: "completed" } });

    assert.equal(before.status, "draft");
  });
});

describe("draft Chapter authoring", () => {
  it("attaches a draft to its governed Series and inherits its disclosure", () => {
    const draft = authorChapterDraft({
      id: "chapter-1",
      series: governedSeries(),
      chapterNumber: 1,
      title: "Mùi Mưa Đầu Tiên",
      body: "Mưa rơi trên mái ngõ.",
    });

    assert.equal(draft.seriesId, "series-1");
    assert.equal(draft.creativeDisclosure, "Hybrid");
    assert.equal(draft.rightsRecordId, undefined);
    assert.equal(draft.provenanceLedgerEntryId, undefined);
    assert.equal(draft.qualityGate, undefined);
    assert.equal(draft.humanApproval, undefined);
  });

  it("refuses a draft that names no chapter, title, or prose", () => {
    for (const changes of [
      { chapterNumber: 0 },
      { chapterNumber: 1.5 },
      { title: "  " },
      { body: "" },
    ]) {
      assert.throws(
        () =>
          authorChapterDraft({
            id: "chapter-1",
            series: governedSeries(),
            chapterNumber: 1,
            title: "Mùi Mưa Đầu Tiên",
            body: "Mưa rơi trên mái ngõ.",
            ...changes,
          }),
        /draft Chapter needs a positive chapter number, a title, and prose/,
        JSON.stringify(changes),
      );
    }
  });

  it("cannot be published on the strength of being authored", () => {
    const series = governedSeries();

    assert.throws(
      () =>
        publishChapter({
          series,
          draft: authorChapterDraft({
            id: "chapter-1",
            series,
            chapterNumber: 1,
            title: "Mùi Mưa Đầu Tiên",
            body: "Mưa rơi trên mái ngõ.",
          }),
          actor: createStaffPrincipal({
            staffAccountId: "staff-editor-1",
            permissions: ["chapter:publish"],
          }),
          publishedChapterNumbers: [],
          lineage: [],
        }),
      /Quality Gate evaluation is required before public publishing/,
    );
  });

  /**
   * Naming a Rights Record and a Provenance Ledger entry is not the same as
   * having been through them: the ids are strings the draft carries, and the
   * Quality Gate is where they are resolved against the records.
   */
  it("still refuses publishing on ids nobody resolved", () => {
    const series = governedSeries();

    assert.throws(
      () =>
        publishChapter({
          series,
          draft: {
            ...authorChapterDraft({
              id: "chapter-1",
              series,
              chapterNumber: 1,
              title: "Mùi Mưa Đầu Tiên",
              body: "Mưa rơi trên mái ngõ.",
            }),
            rightsRecordId: "rights-1",
            provenanceLedgerEntryId: "prov-1",
          },
          actor: createStaffPrincipal({
            staffAccountId: "staff-editor-1",
            permissions: ["chapter:publish"],
          }),
          publishedChapterNumbers: [],
          lineage: [],
        }),
      /Quality Gate evaluation is required before public publishing/,
    );
  });
});

function governedSeries(): Series {
  return createSeries({
    id: "series-1",
    title: "Thanh Kiếm Trong Mưa",
    synopsis: "Một series tiên hiệp trong catalog tuyển chọn của NovelX.",
    creativeDisclosure: "Hybrid",
    taxonomy,
  });
}
