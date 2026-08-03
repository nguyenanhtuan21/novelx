import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createEntitlementRequirement,
  decideChapterAccess,
  ENTITLEMENT_BENEFITS,
  grantEntitlement,
  createReaderAccount,
  type Entitlement,
} from "./index.js";

describe("chapter access by Entitlement state", () => {
  it("grants access when no entitlement is required", () => {
    const decision = decideChapterAccess({
      requirement: undefined,
      entitlements: {},
    });

    assert.equal(decision.granted, true);
  });

  it("blocks a reader who holds no matching entitlement", () => {
    const requirement = createEntitlementRequirement({
      chapterId: "chuong-2",
      benefit: "early-access",
    });

    const decision = decideChapterAccess({
      requirement,
      entitlements: {},
    });

    assert.equal(decision.granted, false);
    assert.deepEqual(decision.granted ? undefined : decision.requirement, {
      chapterId: "chuong-2",
      benefit: "early-access",
    });
  });

  it("grants a reader who holds the entitlement the Chapter demands", () => {
    const requirement = createEntitlementRequirement({
      chapterId: "chuong-2",
      benefit: "early-access",
    });
    const entitled = grantEntitlement(createReaderAccount({ id: "reader-1" }), {
      contentId: "chuong-2",
      benefit: "early-access",
    });

    const decision = decideChapterAccess({
      requirement,
      entitlements: entitled.entitlements,
    });

    assert.equal(decision.granted, true);
  });

  it("does not let one benefit satisfy a different one", () => {
    const requirement = createEntitlementRequirement({
      chapterId: "chuong-2",
      benefit: "early-access",
    });
    const entitled = grantEntitlement(createReaderAccount({ id: "reader-1" }), {
      contentId: "chuong-2",
      benefit: "ad-free",
    });

    const decision = decideChapterAccess({
      requirement,
      entitlements: entitled.entitlements,
    });

    assert.equal(decision.granted, false);
  });

  it("checks the entitlement against the Chapter that demands it", () => {
    const requirement = createEntitlementRequirement({
      chapterId: "chuong-2",
      benefit: "early-access",
    });
    const entitled = grantEntitlement(createReaderAccount({ id: "reader-1" }), {
      contentId: "chuong-3",
      benefit: "early-access",
    });

    const decision = decideChapterAccess({
      requirement,
      entitlements: entitled.entitlements,
    });

    assert.equal(decision.granted, false);
  });

  it("treats public-access as the baseline every reader holds, so it never gates", () => {
    const requirement = createEntitlementRequirement({
      chapterId: "chuong-2",
      benefit: "public-access",
    });

    const decision = decideChapterAccess({
      requirement,
      entitlements: {},
    });

    assert.equal(decision.granted, true);
  });
});

describe("Entitlement Requirement", () => {
  it("names the benefit a Chapter demands before a reader may open it", () => {
    const requirement = createEntitlementRequirement({
      chapterId: "chuong-2",
      benefit: "early-access",
    });

    assert.deepEqual(requirement, {
      chapterId: "chuong-2",
      benefit: "early-access",
    });
  });

  it("rejects a benefit NovelX does not model", () => {
    assert.throws(() =>
      createEntitlementRequirement({
        chapterId: "chuong-2",
        benefit: "vip-only" as Entitlement["benefit"],
      }),
    );
  });

  it("covers every benefit an Entitlement may carry", () => {
    assert.deepEqual(
      [...ENTITLEMENT_BENEFITS],
      ["public-access", "early-access", "ad-free"],
    );
  });
});
