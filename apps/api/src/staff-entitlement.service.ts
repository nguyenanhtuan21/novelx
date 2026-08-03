import { BadRequestException, Injectable } from "@nestjs/common";
import {
  createEntitlementRequirement,
  ENTITLEMENT_BENEFITS,
  type Entitlement,
  type EntitlementBenefit,
  type EntitlementRequirement,
  type RequestPrincipal,
} from "@novelx/shared";

import { domainRule } from "./domain-rule.js";
import type { EntitlementRequirementRepository } from "./entitlement-requirement.repository.js";
import { requireSeriesChapter } from "./governed-content.js";
import type { ReaderLibraryRepository } from "./reader-library.repository.js";
import type { StaffCmsRepository } from "./staff-cms.repository.js";
import {
  staffAuditTarget,
  StaffOperationGate,
} from "./staff-operation-gate.js";

export type StaffEntitlementServiceOptions = {
  now?: () => string;
};

/**
 * The two authorities Entitlement-ready access needs, both behind one
 * permission: marking a Chapter as demanding a benefit, and granting a reader
 * the entitlement that satisfies it.
 *
 * Real payment-provider integration is deferred (ADR-0020), so granting is the
 * stub a provider's webhook would eventually call. Marking and granting change
 * access policy rather than content, so each leaves the Staff Audit Record and
 * not the Provenance Ledger — like a schedule, an entitlement decision is an
 * operation rather than lineage.
 */
@Injectable()
export class StaffEntitlementService {
  private readonly now: () => string;

  constructor(
    private readonly gate: StaffOperationGate,
    private readonly staffCmsRepository: StaffCmsRepository,
    private readonly entitlementRequirementRepository: EntitlementRequirementRepository,
    private readonly readerLibraryRepository: ReaderLibraryRepository,
    options: StaffEntitlementServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async markRequirement(input: {
    principal: RequestPrincipal;
    seriesId: string;
    chapterId: string;
    benefit: unknown;
  }): Promise<EntitlementRequirement> {
    const benefit = requireBenefit(input.benefit);

    return this.gate.run(
      input.principal,
      {
        action: "staff.chapter-entitlement.mark",
        target: staffAuditTarget("chapter-draft", input.chapterId),
        permission: "entitlement:write",
      },
      async () => {
        await requireSeriesChapter(this.staffCmsRepository, input);
        const requirement = domainRule(() =>
          createEntitlementRequirement({
            chapterId: input.chapterId,
            benefit,
          }),
        );

        await this.entitlementRequirementRepository.saveRequirement(
          requirement,
        );

        return requirement;
      },
    );
  }

  async grantEntitlement(input: {
    principal: RequestPrincipal;
    readerAccountId: unknown;
    contentId: unknown;
    benefit: unknown;
  }): Promise<Entitlement> {
    const readerAccountId = requireNonEmpty(
      input.readerAccountId,
      "granting an Entitlement needs the reader account it is granted to",
    );
    const contentId = requireNonEmpty(
      input.contentId,
      "granting an Entitlement needs the content it grants access to",
    );
    const benefit = requireBenefit(input.benefit);
    const entitlement: Entitlement = { contentId, benefit };

    return this.gate.run(
      input.principal,
      {
        action: "staff.reader-entitlement.grant",
        target: `reader-account:${readerAccountId}`,
        permission: "entitlement:write",
      },
      async () => {
        await this.readerLibraryRepository.grantEntitlement({
          readerAccountId,
          entitlement,
          grantedAt: this.now(),
        });

        return entitlement;
      },
    );
  }
}

function requireBenefit(benefit: unknown): EntitlementBenefit {
  if (
    typeof benefit !== "string" ||
    !ENTITLEMENT_BENEFITS.includes(benefit as EntitlementBenefit)
  ) {
    throw new BadRequestException(
      `an Entitlement needs a benefit: ${ENTITLEMENT_BENEFITS.join(", ")}`,
    );
  }

  return benefit as EntitlementBenefit;
}

function requireNonEmpty(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException(message);
  }

  return value;
}
