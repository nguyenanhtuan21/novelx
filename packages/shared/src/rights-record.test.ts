import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  attachWorkflowMaterial,
  authorChapterDraft,
  clearMaterialForWorkflowUse,
  createAiWorkflowPrincipal,
  createAnonymousReaderPrincipal,
  createReaderPrincipal,
  createRightsRecord,
  createSeries,
  createStaffPrincipal,
  RightsGrantExceededError,
  RightsRecordRequiredError,
  StaffAccessDeniedError,
  UnbackedRightsEvidenceError,
  WorkflowMaterialAlreadyAttachedError,
  type ChapterDraft,
  type ManagedTaxonomy,
  type RequestPrincipal,
  type RightsRecord,
  type RightsUse,
  type UnbackedRightsClaim,
  type WorkflowMaterial,
} from "./index.js";

const rightsManager = createStaffPrincipal({
  staffAccountId: "staff-rights-1",
  permissions: ["rights:write"],
});

const material: WorkflowMaterial = {
  id: "asset-cover-illustration-1",
  kind: "asset",
};

const grant = {
  owner: "Studio Mưa Ngâu",
  scope: ["ai-workflow", "publishing"] as RightsUse[],
  territories: ["VN"],
  duration: {
    from: "2026-01-01T00:00:00.000Z",
    until: "2027-01-01T00:00:00.000Z",
  },
  modificationAllowed: true,
  aiUseAllowed: true,
  evidence: {
    kind: "signed-licence" as const,
    reference: "contract-2026-014",
  },
};

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

describe("Rights Record", () => {
  it("keeps the grant an accountable editor entered", () => {
    const record = rightsRecord();

    assert.equal(record.id, "rights-1");
    assert.deepEqual(record.material, material);
    assert.equal(record.owner, "Studio Mưa Ngâu");
    assert.deepEqual(record.scope, ["ai-workflow", "publishing"]);
    assert.deepEqual(record.territories, ["VN"]);
    assert.deepEqual(record.duration, grant.duration);
    assert.equal(record.modificationAllowed, true);
    assert.equal(record.aiUseAllowed, true);
    assert.deepEqual(record.evidence, grant.evidence);
    assert.equal(record.recordedByStaffAccountId, "staff-rights-1");
    assert.equal(record.recordedAt, "2026-08-01T08:00:00.000Z");
  });

  it("refuses being reachable on the Internet as evidence of a grant", () => {
    const unbacked: UnbackedRightsClaim[] = [
      "public-availability",
      "source-url",
    ];

    for (const kind of unbacked) {
      assert.throws(
        () =>
          rightsRecord({
            evidence: { kind, reference: "https://example.invalid/art.png" },
          }),
        UnbackedRightsEvidenceError,
        kind,
      );
    }
  });

  it("refuses evidence that does not say where the grant is held", () => {
    assert.throws(
      () =>
        rightsRecord({
          evidence: { kind: "signed-licence", reference: "  " },
        }),
      /Rights evidence must reference the grant it is backed by/,
    );
  });

  it("refuses a grant that leaves owner, scope, or territory unnamed", () => {
    for (const incomplete of [
      { owner: " " },
      { scope: [] as RightsUse[] },
      { territories: [] },
      { territories: [" "] },
    ]) {
      assert.throws(
        () => rightsRecord(incomplete),
        /Rights Record needs an owner, a scope of use, and a territory/,
        JSON.stringify(incomplete),
      );
    }
  });

  it("refuses a grant that runs out before it starts", () => {
    assert.throws(
      () =>
        rightsRecord({
          duration: {
            from: "2026-01-01T00:00:00.000Z",
            until: "2025-01-01T00:00:00.000Z",
          },
        }),
      /Rights Record needs a duration that starts before it runs out/,
    );
  });

  it("refuses a grant that is not dated at all", () => {
    assert.throws(
      () => rightsRecord({ duration: { from: "whenever" } }),
      /Rights Record needs a duration that starts before it runs out/,
    );
  });

  it("holds an open-ended grant with no agreed expiry", () => {
    const record = rightsRecord({
      duration: { from: "2026-01-01T00:00:00.000Z" },
    });

    assert.equal(record.duration.until, undefined);
  });

  it("refuses AI-workflow scope from a grant that forbids AI use", () => {
    assert.throws(
      () => rightsRecord({ scope: ["ai-workflow"], aiUseAllowed: false }),
      /cannot clear AI-workflow use while the grant refuses AI use/,
    );
  });

  it("refuses every path that is not a Staff Account holding rights:write", () => {
    const unprivileged: RequestPrincipal[] = [
      createAiWorkflowPrincipal({
        workspaceId: "novelx",
        workflowRunId: "run-1",
      }),
      createReaderPrincipal({ readerAccountId: "reader-1" }),
      createAnonymousReaderPrincipal({ anonymousSessionId: "anon-1" }),
      createStaffPrincipal({
        staffAccountId: "staff-editor-1",
        permissions: ["chapter:write"],
      }),
      undefined,
    ];

    for (const actor of unprivileged) {
      assert.throws(
        () => rightsRecord({ actor }),
        StaffAccessDeniedError,
        `${actor?.kind ?? "unauthenticated"}`,
      );
    }
  });
});

describe("workflow material without a Rights Record", () => {
  it("is refused before AI use and before publishing use alike", () => {
    for (const use of ["ai-workflow", "publishing"] as RightsUse[]) {
      assert.throws(
        () => cleared({ use, rightsRecord: undefined }),
        RightsRecordRequiredError,
        use,
      );
    }
  });

  it("is refused when the only Rights Record covers other material", () => {
    assert.throws(
      () =>
        cleared({
          rightsRecord: rightsRecord({
            material: { id: "asset-other-1", kind: "asset" },
          }),
        }),
      RightsRecordRequiredError,
    );
  });

  /**
   * A dataset and an asset can share a name; the record has to cover the thing
   * the workflow is actually reaching for, not something else called the same.
   */
  it("is refused when the Rights Record covers another kind of material", () => {
    assert.throws(
      () =>
        cleared({
          rightsRecord: rightsRecord({
            material: { id: material.id, kind: "dataset" },
          }),
        }),
      RightsRecordRequiredError,
    );
  });
});

describe("workflow material a Rights Record covers", () => {
  it("is cleared for the use, territory, and time the grant covers", () => {
    const attachment = cleared();

    assert.deepEqual(attachment, {
      material,
      use: "ai-workflow",
      rightsRecordId: "rights-1",
      territory: "VN",
      modifies: false,
      clearedAt: "2026-08-01T09:00:00.000Z",
    });
  });

  it("is refused for a use the grant does not cover", () => {
    assert.throws(
      () =>
        cleared({
          use: "publishing",
          rightsRecord: rightsRecord({ scope: ["ai-workflow"] }),
        }),
      RightsGrantExceededError,
    );
  });

  /**
   * AI use is checked against the grant itself and not only against the scope
   * list, because it is the dimension where a wrong answer is a licensing
   * breach rather than a metadata mistake.
   */
  it("is refused for AI use by a grant that forbids AI use", () => {
    const publishingOnly: RightsRecord = {
      ...rightsRecord({ scope: ["publishing"], aiUseAllowed: false }),
      scope: ["ai-workflow", "publishing"],
    };

    assert.throws(
      () => cleared({ rightsRecord: publishingOnly }),
      /the grant refuses AI use/,
    );
  });

  it("is refused before the grant starts and after it has run out", () => {
    for (const usedAt of [
      "2025-12-31T23:59:59.000Z",
      "2027-01-01T00:00:01.000Z",
    ]) {
      assert.throws(
        () => cleared({ usedAt }),
        RightsGrantExceededError,
        usedAt,
      );
    }
  });

  it("is refused outside the territory the grant covers", () => {
    assert.throws(() => cleared({ territory: "JP" }), RightsGrantExceededError);
  });

  it("is cleared anywhere by a worldwide grant", () => {
    const attachment = cleared({
      territory: "JP",
      rightsRecord: rightsRecord({ territories: ["worldwide"] }),
    });

    assert.equal(attachment.territory, "JP");
  });

  it("is refused for modification the grant does not allow", () => {
    assert.throws(
      () =>
        cleared({
          modifies: true,
          rightsRecord: rightsRecord({ modificationAllowed: false }),
        }),
      /the grant does not allow modification/,
    );
  });

  it("is cleared for modification the grant allows", () => {
    assert.equal(cleared({ modifies: true }).modifies, true);
  });
});

describe("attaching cleared material to a draft Chapter", () => {
  it("leaves a fresh draft carrying no workflow material at all", () => {
    assert.equal(draftChapter().workflowMaterials, undefined);
  });

  it("keeps the Rights Record that cleared each attachment", () => {
    const attached = attachWorkflowMaterial({
      draft: draftChapter(),
      attachment: cleared(),
    });

    assert.deepEqual(attached.workflowMaterials, [cleared()]);
  });

  it("does not mutate the draft it was given", () => {
    const before = draftChapter();

    attachWorkflowMaterial({ draft: before, attachment: cleared() });

    assert.equal(before.workflowMaterials, undefined);
  });

  it("refuses the same material twice for the same use", () => {
    const attached = attachWorkflowMaterial({
      draft: draftChapter(),
      attachment: cleared(),
    });

    assert.throws(
      () => attachWorkflowMaterial({ draft: attached, attachment: cleared() }),
      WorkflowMaterialAlreadyAttachedError,
    );
  });

  it("holds the same material for a second, separately cleared use", () => {
    const attached = attachWorkflowMaterial({
      draft: attachWorkflowMaterial({
        draft: draftChapter(),
        attachment: cleared(),
      }),
      attachment: cleared({ use: "publishing" }),
    });

    assert.deepEqual(
      attached.workflowMaterials?.map((entry) => entry.use),
      ["ai-workflow", "publishing"],
    );
  });
});

function rightsRecord(
  changes: Partial<Parameters<typeof createRightsRecord>[0]> = {},
): RightsRecord {
  return createRightsRecord({
    id: "rights-1",
    material,
    ...grant,
    actor: rightsManager,
    recordedAt: "2026-08-01T08:00:00.000Z",
    ...changes,
  });
}

function cleared(
  changes: Partial<Parameters<typeof clearMaterialForWorkflowUse>[0]> = {},
) {
  return clearMaterialForWorkflowUse({
    material,
    use: "ai-workflow",
    rightsRecord: rightsRecord(),
    territory: "VN",
    usedAt: "2026-08-01T09:00:00.000Z",
    ...changes,
  });
}

function draftChapter(): ChapterDraft {
  const series = createSeries({
    id: "series-1",
    title: "Thanh Kiếm Trong Mưa",
    synopsis: "Một series tiên hiệp trong catalog tuyển chọn của NovelX.",
    creativeDisclosure: "Hybrid",
    taxonomy,
  });

  return authorChapterDraft({
    id: "chuong-1",
    series,
    chapterNumber: 1,
    title: "Mùi Mưa Đầu Tiên",
    body: "Mưa rơi trên mái ngõ.",
  });
}
