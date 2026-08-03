import type { EntitlementRequirement } from "@novelx/shared";

import type { EntitlementRequirementRepository } from "./entitlement-requirement.repository.js";

export class InMemoryEntitlementRequirementRepository implements EntitlementRequirementRepository {
  private readonly requirements = new Map<string, EntitlementRequirement>();

  async saveRequirement(requirement: EntitlementRequirement): Promise<void> {
    this.requirements.set(requirement.chapterId, requirement);
  }

  async findRequirement(
    chapterId: string,
  ): Promise<EntitlementRequirement | undefined> {
    return this.requirements.get(chapterId);
  }
}
