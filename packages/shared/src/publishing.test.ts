import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertStaffMayPublish,
  authorChapterDraft,
  createAnonymousReaderSession,
  createAiPersona,
  createChapterDraft,
  createReaderPrincipal,
  createReaderAccount,
  createSeries,
  createStaffPrincipal,
  grantEntitlement,
  publishChapter,
  publicChapter,
  recordAnonymousProgress,
  updateSeries,
  upgradeAnonymousProgress,
  type ChapterDraft,
  type CreativeDisclosure,
  type ManagedTaxonomy,
  type ReportedQualityCheck,
} from "./index.js";
import {
  chapterDraftLineage,
  passedQualityGate,
  reportedChecks,
} from "./quality-gate.fixture.js";

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
      publishedChapterNumbers: [],
      lineage: chapterDraftLineage(draft),
    });

    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.body, draft.body);
    assert.deepEqual(snapshot.creativeDisclosure, "Hybrid");
  });

  it("snapshots the AI Persona readers saw with an AI-Assisted Chapter", () => {
    const persona = createAiPersona({
      id: "persona-1",
      displayName: "May Ke Chuyen NovelX",
      disclosure: "AI-operated creative persona",
      managedContentLineIds: ["series-1"],
    });
    const series = createSeries({
      id: "series-1",
      title: "Thanh Kiếm Trong Mưa",
      synopsis: "A curated Vietnamese serialized story.",
      creativeDisclosure: "AI-Assisted",
      aiPersona: persona,
      taxonomy: validTaxonomy(),
    });
    const draft = createApprovedDraft({
      id: "chapter-1",
      seriesId: series.id,
      body: "Chapter body long enough for a reader-facing snapshot.",
      creativeDisclosure: "AI-Assisted",
    });

    const snapshot = publishChapter({
      series,
      draft,
      actor: createStaffPrincipal({
        staffAccountId: "staff-editor-1",
        permissions: ["chapter:publish"],
      }),
      publishedChapterNumbers: [],
      lineage: chapterDraftLineage(draft),
    });

    assert.equal(snapshot.aiPersona?.displayName, "May Ke Chuyen NovelX");
    assert.equal(
      "canAuthenticate" in (publicChapter(snapshot).aiPersona ?? {}),
      false,
    );
    assert.equal(
      "managedContentLineIds" in (publicChapter(snapshot).aiPersona ?? {}),
      false,
    );
  });

  it("refuses to publish a stale non-AI-Assisted draft after a Series gets an AI Persona", () => {
    const draft = createApprovedDraft({
      id: "chapter-1",
      seriesId: "series-1",
      body: "Chapter body long enough for a reader-facing snapshot.",
      creativeDisclosure: "Human",
    });
    const series = createSeries({
      id: "series-1",
      title: "Thanh Kiếm Trong Mưa",
      synopsis: "A curated Vietnamese serialized story.",
      creativeDisclosure: "AI-Assisted",
      aiPersona: createAiPersona({
        id: "persona-1",
        displayName: "May Ke Chuyen NovelX",
        disclosure: "AI-operated creative persona",
        managedContentLineIds: ["series-1"],
      }),
      taxonomy: validTaxonomy(),
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
          publishedChapterNumbers: [],
          lineage: chapterDraftLineage(draft),
        }),
      /AI Persona content lines must use AI-Assisted/,
    );
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
          publishedChapterNumbers: [],
          lineage: chapterDraftLineage(draft),
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
      managedContentLineIds: ["series-1", "series-ai-persona"],
    });

    assert.equal(persona.canAuthenticate, false);
    assert.throws(
      () =>
        createAiPersona({
          id: "persona-login",
          displayName: "May Dang Nhap",
          disclosure: "AI-operated creative persona",
          managedContentLineIds: [],
          canAuthenticate: true,
        }),
      /AI Persona cannot authenticate/,
    );
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
    assert.throws(
      () =>
        createAiPersona({
          id: "persona-3",
          displayName: "Tac gia trai nghiem ao",
          disclosure: "AI-operated creative persona",
          managedContentLineIds: [],
          fakeHumanLivedExperience: "I survived the war I write about.",
        }),
      /AI Persona must not present fake-human/,
    );
    assert.throws(
      () =>
        createAiPersona({
          id: "persona-4",
          displayName: "Nguoi duoc chung thuc ao",
          disclosure: "AI-operated creative persona",
          managedContentLineIds: [],
          fakeHumanTestimonials: ["Readers say I changed their lives."],
        }),
      /AI Persona must not present fake-human/,
    );
  });

  it("keeps AI Persona content lines tied to AI-Assisted disclosure", () => {
    const persona = createAiPersona({
      id: "persona-1",
      displayName: "May Ke Chuyen NovelX",
      disclosure: "AI-operated creative persona",
      managedContentLineIds: ["series-1"],
    });

    assert.throws(
      () =>
        createSeries({
          id: "series-human-persona",
          title: "Series Human",
          synopsis: "A contradictory public content line.",
          creativeDisclosure: "Human",
          aiPersona: persona,
          taxonomy: validTaxonomy(),
        }),
      /AI Persona content lines must use AI-Assisted/,
    );

    assert.throws(
      () =>
        createSeries({
          id: "series-mismatched-persona",
          title: "Series Mismatched Persona",
          synopsis: "A persona claiming a different content line.",
          creativeDisclosure: "AI-Assisted",
          aiPersona: createAiPersona({
            id: "persona-other-series",
            displayName: "May Khac",
            disclosure: "AI-operated creative persona",
            managedContentLineIds: ["other-series"],
          }),
          taxonomy: validTaxonomy(),
        }),
      /AI Persona must name the Series content line/,
    );

    const series = createSeries({
      id: "series-1",
      title: "Series AI Persona",
      synopsis: "A transparent public content line.",
      creativeDisclosure: "AI-Assisted",
      aiPersona: persona,
      taxonomy: validTaxonomy(),
    });

    assert.throws(
      () =>
        updateSeries({
          series,
          changes: { creativeDisclosure: "Hybrid" },
        }),
      /AI Persona content lines must use AI-Assisted/,
    );

    assert.throws(
      () =>
        authorChapterDraft({
          id: "chapter-human-override",
          series,
          chapterNumber: 1,
          title: "Wrong disclosure",
          body: "This chapter would hide the Series AI Persona disclosure.",
          creativeDisclosure: "Human",
        }),
      /AI Persona content lines must use AI-Assisted/,
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

function validTaxonomy(): ManagedTaxonomy {
  return {
    genre: "fantasy",
    subgenre: "kiem-hiep",
    tropes: [],
    moods: [],
    themes: [],
    audience: "young-adult",
    ageRating: "13+",
    contentWarnings: [],
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
