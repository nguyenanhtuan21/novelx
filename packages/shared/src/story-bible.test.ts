import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  amendCanon,
  createAiWorkflowPrincipal,
  createAnonymousReaderPrincipal,
  createReaderPrincipal,
  createStaffPrincipal,
  createStoryBible,
  LockedCanonError,
  lockStoryBible,
  StaffAccessDeniedError,
  staffAuditActor,
  type CanonEntry,
  type RequestPrincipal,
  type StoryBible,
} from "./index.js";

const editor = createStaffPrincipal({
  staffAccountId: "staff-editor-1",
  permissions: ["canon:write"],
});

const canon: CanonEntry[] = [
  { id: "world-rule-1", statement: "Cultivation costs memory, never money." },
];

describe("Story Bible authoring", () => {
  it("starts a Series canon empty and unlocked", () => {
    const storyBible = createStoryBible({
      seriesId: "series-1",
      actor: editor,
    });

    assert.deepEqual(storyBible, { seriesId: "series-1", canon: [] });
  });

  it("amends canon without mutating the Story Bible it was given", () => {
    const before = createStoryBible({ seriesId: "series-1", actor: editor });

    const after = amendCanon({ storyBible: before, canon, actor: editor });

    assert.deepEqual(before.canon, []);
    assert.deepEqual(after.canon, canon);
  });

  it("refuses canon entries that say nothing, or say it twice", () => {
    const storyBible = createStoryBible({
      seriesId: "series-1",
      actor: editor,
    });

    for (const invalid of [
      [{ id: "", statement: "Unnamed rule." }],
      [{ id: "world-rule-1", statement: " " }],
      [...canon, ...canon],
    ]) {
      assert.throws(
        () => amendCanon({ storyBible, canon: invalid, actor: editor }),
        /Canon entries need a unique id and a statement/,
        JSON.stringify(invalid),
      );
    }
  });
});

describe("locked Canon", () => {
  it("names the accountable human who locked it, and when", () => {
    const locked = lockStoryBible({
      storyBible: amendCanon({
        storyBible: createStoryBible({ seriesId: "series-1", actor: editor }),
        canon,
        actor: editor,
      }),
      actor: editor,
      lockedAt: "2026-08-01T08:00:00.000Z",
    });

    assert.deepEqual(locked.lock, {
      staffAccountId: "staff-editor-1",
      lockedAt: "2026-08-01T08:00:00.000Z",
    });
  });

  it("refuses a change that does not say why it changed locked Canon", () => {
    assert.throws(
      () =>
        amendCanon({
          storyBible: lockedStoryBible(),
          canon: [{ id: "world-rule-1", statement: "Cultivation is free." }],
          actor: editor,
        }),
      LockedCanonError,
    );
  });

  it("accepts a change to locked Canon that an accountable human explains", () => {
    const amended = amendCanon({
      storyBible: lockedStoryBible(),
      canon: [{ id: "world-rule-1", statement: "Cultivation costs years." }],
      actor: editor,
      reason: "Retcon approved by the series editorial owner",
    });

    assert.deepEqual(amended.canon, [
      { id: "world-rule-1", statement: "Cultivation costs years." },
    ]);
    assert.deepEqual(amended.lock, lockedStoryBible().lock);
  });

  it("keeps the human who first took production use on, when locked again", () => {
    const first = lockedStoryBible();

    const relocked = lockStoryBible({
      storyBible: first,
      actor: createStaffPrincipal({
        staffAccountId: "staff-editor-2",
        permissions: ["canon:write"],
      }),
      lockedAt: "2026-08-02T09:00:00.000Z",
    });

    assert.deepEqual(relocked.lock, first.lock);
  });

  it("refuses a reason that is only whitespace", () => {
    assert.throws(
      () =>
        amendCanon({
          storyBible: lockedStoryBible(),
          canon,
          actor: editor,
          reason: "   ",
        }),
      LockedCanonError,
    );
  });
});

describe("Canon is human-owned", () => {
  it("refuses every non-human and non-staff path, locked or not", () => {
    const aiWorkflow = createAiWorkflowPrincipal({
      workspaceId: "novelx",
      workflowRunId: "run-1",
    });
    const nonHumanPaths: RequestPrincipal[] = [
      aiWorkflow,
      createReaderPrincipal({ readerAccountId: "reader-1" }),
      createAnonymousReaderPrincipal({ anonymousSessionId: "anon-1" }),
      undefined,
    ];

    for (const actor of nonHumanPaths) {
      assert.throws(
        () => createStoryBible({ seriesId: "series-1", actor }),
        StaffAccessDeniedError,
        `createStoryBible: ${actor?.kind}`,
      );
      assert.throws(
        () =>
          amendCanon({
            storyBible: lockedStoryBible(),
            canon,
            actor,
            reason: "AI workflow proposed a canon change",
          }),
        StaffAccessDeniedError,
        `amendCanon locked: ${actor?.kind}`,
      );
      assert.throws(
        () =>
          lockStoryBible({
            storyBible: createStoryBible({
              seriesId: "series-1",
              actor: editor,
            }),
            actor,
            lockedAt: "2026-08-01T08:00:00.000Z",
          }),
        StaffAccessDeniedError,
        `lockStoryBible: ${actor?.kind}`,
      );
    }
  });

  it("refuses a Staff Account that does not hold canon:write", () => {
    assert.throws(
      () =>
        amendCanon({
          storyBible: createStoryBible({ seriesId: "series-1", actor: editor }),
          canon,
          actor: createStaffPrincipal({
            staffAccountId: "staff-moderator-1",
            permissions: ["series:takedown"],
          }),
        }),
      StaffAccessDeniedError,
    );
  });

  it("keeps the AI workflow that reached for Canon as audit evidence", () => {
    assert.deepEqual(
      staffAuditActor(
        createAiWorkflowPrincipal({
          workspaceId: "novelx",
          workflowRunId: "run-1",
        }),
      ),
      { kind: "ai-workflow", workspaceId: "novelx", workflowRunId: "run-1" },
    );
  });
});

function lockedStoryBible(): StoryBible {
  return lockStoryBible({
    storyBible: amendCanon({
      storyBible: createStoryBible({ seriesId: "series-1", actor: editor }),
      canon,
      actor: editor,
    }),
    actor: editor,
    lockedAt: "2026-08-01T08:00:00.000Z",
  });
}
