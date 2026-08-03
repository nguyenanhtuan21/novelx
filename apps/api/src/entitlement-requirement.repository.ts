import type { EntitlementRequirement } from "@novelx/shared";

export const ENTITLEMENT_REQUIREMENT_REPOSITORY = Symbol(
  "ENTITLEMENT_REQUIREMENT_REPOSITORY",
);

/**
 * The access policy NovelX holds against its published Chapters: which benefit
 * a Chapter demands before a reader may open it.
 *
 * A requirement is deliberately held apart from the Published Snapshot, because
 * access policy is a commercial decision that changes independently of the
 * immutable content a snapshot keeps (ADR-0020): changing a Chapter's access
 * policy never touches what was published.
 */
export type EntitlementRequirementRepository = {
  saveRequirement(requirement: EntitlementRequirement): Promise<void>;
  findRequirement(
    chapterId: string,
  ): Promise<EntitlementRequirement | undefined>;
};
