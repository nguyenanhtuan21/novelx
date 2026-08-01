import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertStaffMayPublish,
  createAnonymousReaderSession,
  createAiPersona,
  createChapterDraft,
  createReaderPrincipal,
  createReaderAccount,
  createSeries,
  createStaffPrincipal,
  grantEntitlement,
  publishChapter,
  recordAnonymousProgress,
  revisePublishedChapter,
  upgradeAnonymousProgress,
  type ChapterDraft,
  type CreativeDisclosure,
  type ReportedQualityCheck,
} from "./index.js";
import { passedQualityGate, reportedChecks } from "./quality-gate.fixture.js";

describe("publish/read workflow", () => {
  it("requires rights, provenance, quality gate, and human approval before public reading", () => {
    const series = createSeries({
      id: "series-1",
      title: "Thanh Kiếm Trong Mưa",
      synopsis: "A curated Vietnamese serialized story.",
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
    });
    const draft = createApprovedDraft({
      id: "chapter-1",
      seriesId: series.id,
      body: "Chapter body long enough for a reader-facing snapshot.",
      creativeDisclosure: "Hybrid",
    });

    const snapshot = publishChapter({
      series,
      draft,
      actor: createStaffPrincipal({
        staffAccountId: "staff-editor-1",
        permissions: ["chapter:publish"],
      }),
    });

    assert.equal(snapshot.publiclyReadable, true);
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.body, draft.body);
    assert.deepEqual(snapshot.creativeDisclosure, "Hybrid");
  });

  it("blocks public publishing when any blocking quality gate condition fails", () => {
    const series = createSeries({
      id: "series-1",
      title: "Thanh Kiếm Trong Mưa",
      synopsis: "A curated Vietnamese serialized story.",
      creativeDisclosure: "AI-Assisted",
      taxonomy: {
        genre: "fantasy",
        subgenre: "kiem-hiep",
        tropes: [],
        moods: [],
        themes: [],
        audience: "young-adult",
        ageRating: "13+",
        contentWarnings: [],
      },
    });
    const draft = createApprovedDraft({
      id: "chapter-1",
      seriesId: series.id,
      body: "Chapter body long enough for a reader-facing snapshot.",
      creativeDisclosure: "AI-Assisted",
      reportedChecks: reportedChecks.map((check) =>
        check.condition === "policySafety"
          ? { ...check, verdict: "blocking-failure" as const }
          : check,
      ),
    });

    assert.throws(
      () =>
        publishChapter({
          series,
          draft,
          actor: createStaffPrincipal({
            staffAccountId: "staff-editor-1",
            permissions: ["chapter:publish"],
          }),
        }),
      /blocking Quality Gate failure: policySafety/,
    );
  });

  it("rejects draft workflow entry without rights and provenance records", () => {
    const draft = plainDraft({
      id: "chapter-1",
      seriesId: "series-1",
      body: "Draft text.",
      creativeDisclosure: "Human",
    });

    assert.throws(
      () =>
        createChapterDraft({
          ...draft,
          rightsRecordId: "",
          qualityGate: passedQualityGate(draft),
        }),
      /Rights Record is required before draft workflow entry/,
    );
  });
});

describe("Published Snapshot revisions", () => {
  it("creates a new snapshot for post-publication fixes instead of mutating the prior snapshot", () => {
    const series = createSeries({
      id: "series-1",
      title: "Thanh Kiếm Trong Mưa",
      synopsis: "A curated Vietnamese serialized story.",
      creativeDisclosure: "Human",
      taxonomy: {
        genre: "fantasy",
        subgenre: "kiem-hiep",
        tropes: [],
        moods: [],
        themes: [],
        audience: "young-adult",
        ageRating: "13+",
        contentWarnings: [],
      },
    });
    const originalDraft = createApprovedDraft({
      id: "chapter-1",
      seriesId: series.id,
      body: "Original public text.",
    });
    const originalSnapshot = publishChapter({
      series,
      draft: originalDraft,
      actor: createStaffPrincipal({
        staffAccountId: "staff-editor-1",
        permissions: ["chapter:publish"],
      }),
    });

    const fixedSnapshot = revisePublishedChapter({
      previousSnapshot: originalSnapshot,
      fixedDraft: createApprovedDraft({
        id: "chapter-1",
        seriesId: series.id,
        body: "Fixed public text.",
      }),
      actor: createStaffPrincipal({
        staffAccountId: "staff-editor-2",
        permissions: ["chapter:publish"],
      }),
      reason: "Fix typo reported by editorial QA",
    });

    assert.equal(originalSnapshot.version, 1);
    assert.equal(originalSnapshot.body, "Original public text.");
    assert.equal(fixedSnapshot.version, 2);
    assert.equal(fixedSnapshot.body, "Fixed public text.");
  });
});

describe("authorization boundary", () => {
  it("rejects reader principals for staff-only publishing operations", () => {
    assert.throws(
      () =>
        assertStaffMayPublish(
          createReaderPrincipal({ readerAccountId: "reader-1" }),
        ),
      /Staff Account is required/,
    );

    assert.doesNotThrow(() =>
      assertStaffMayPublish(
        createStaffPrincipal({
          staffAccountId: "staff-1",
          permissions: ["chapter:publish"],
        }),
      ),
    );
  });
});

describe("AI Persona boundary", () => {
  it("allows transparent AI creative personas but rejects fake-human fields and login principals", () => {
    const persona = createAiPersona({
      id: "persona-1",
      displayName: "May Ke Chuyen NovelX",
      disclosure: "AI-operated creative persona",
      managedContentLineIds: ["series-1"],
    });

    assert.equal(persona.canAuthenticate, false);
    assert.throws(
      () =>
        createAiPersona({
          id: "persona-2",
          displayName: "Tac gia ao",
          disclosure: "AI-operated creative persona",
          managedContentLineIds: [],
          fakeHumanBiography: "Born in Hue and writing from lived experience.",
        }),
      /AI Persona must not present fake-human biography/,
    );
  });
});

describe("Managed Taxonomy", () => {
  it("requires governed dimensions for catalog classification", () => {
    assert.throws(
      () =>
        createSeries({
          id: "series-untaxed",
          title: "Untaxed Series",
          synopsis: "Invalid catalog entry.",
          creativeDisclosure: "Human",
          taxonomy: {
            genre: "",
            subgenre: "",
            tropes: [],
            moods: [],
            themes: [],
            audience: "",
            ageRating: "",
            contentWarnings: [],
          },
        }),
      /Managed Taxonomy requires genre, subgenre, audience, and age rating/,
    );
  });
});

describe("anonymous reader progress", () => {
  it("preserves lightweight chapter progress when an anonymous session becomes a reader account", () => {
    const session = recordAnonymousProgress(
      createAnonymousReaderSession({ id: "anon-1" }),
      {
        seriesId: "series-1",
        chapterId: "chapter-1",
        position: 1842,
        updatedAt: "2026-07-31T00:00:00.000Z",
      },
    );
    const reader = createReaderAccount({ id: "reader-1" });

    const upgraded = upgradeAnonymousProgress({ session, reader });

    assert.equal(upgraded.progress["series-1/chapter-1"]?.position, 1842);
  });

  it("keeps newer Reader Account progress when an upgrade is retried", () => {
    const session = recordAnonymousProgress(
      createAnonymousReaderSession({ id: "anon-1" }),
      {
        seriesId: "series-1",
        chapterId: "chapter-1",
        position: 1842,
        updatedAt: "2026-07-31T00:00:00.000Z",
      },
    );
    const reader = {
      ...createReaderAccount({ id: "reader-1" }),
      progress: {
        "series-1/chapter-1": {
          seriesId: "series-1",
          chapterId: "chapter-1",
          position: 2400,
          updatedAt: "2026-07-31T00:10:00.000Z",
        },
      },
    };

    const upgraded = upgradeAnonymousProgress({ session, reader });

    assert.equal(upgraded.progress["series-1/chapter-1"]?.position, 2400);
  });
});

describe("entitlement boundary", () => {
  it("uses entitlement state to decide reader access before payment integration exists", () => {
    const reader = grantEntitlement(createReaderAccount({ id: "reader-1" }), {
      contentId: "chapter-early-1",
      benefit: "early-access",
    });

    assert.equal(
      reader.entitlements["chapter-early-1"]?.benefit,
      "early-access",
    );
  });
});

type DraftFixture = {
  id: string;
  seriesId: string;
  body: string;
  creativeDisclosure?: CreativeDisclosure;
};

/** A draft carrying everything the Quality Gate reads off the record. */
function plainDraft(input: DraftFixture): ChapterDraft {
  return {
    id: input.id,
    seriesId: input.seriesId,
    chapterNumber: 1,
    title: "Mui Mua Dau Tien",
    body: input.body,
    creativeDisclosure: input.creativeDisclosure ?? "Human",
    rightsRecordId: "rights-1",
    provenanceLedgerEntryId: "prov-1",
    humanApproval: {
      reviewerStaffAccountId: "staff-editor-1",
      approvedAt: "2026-07-31T00:00:00.000Z",
    },
  };
}

/**
 * A draft that has been through the Quality Gate, which is the only way to hold
 * a gate result: publishing reads what the gate concluded, never a claim about it.
 */
function createApprovedDraft(
  input: DraftFixture & { reportedChecks?: readonly ReportedQualityCheck[] },
) {
  const draft = plainDraft(input);

  return createChapterDraft({
    ...draft,
    rightsRecordId: "rights-1",
    qualityGate: passedQualityGate(draft, {
      ...(input.reportedChecks ? { reportedChecks: input.reportedChecks } : {}),
    }),
  });
}
