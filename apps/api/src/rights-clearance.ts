import { BadRequestException, Injectable } from "@nestjs/common";
import {
  clearMaterialForWorkflowUse,
  RIGHTS_USES,
  WORKFLOW_MATERIAL_KINDS,
  type RightsUse,
  type WorkflowMaterial,
  type WorkflowMaterialAttachment,
} from "@novelx/shared";

import { domainRule } from "./domain-rule.js";
import type { RightsRepository } from "./rights.repository.js";

export const RIGHTS_CLEARANCE = Symbol("RIGHTS_CLEARANCE");

/** A use of material as a request states it, before any of it is believed. */
export type MaterialUseRequest = {
  material?: Partial<WorkflowMaterial>;
  use?: RightsUse;
  territory?: string;
  modifies?: boolean;
};

export type RightsClearanceOptions = {
  now?: () => string;
};

/**
 * Answers whether workflow material may be used, against the grants on record.
 *
 * It asserts no permission of its own (ADR-0015): this is a question about a
 * licence, not about authority, and a caller that cannot ask cannot comply.
 * Who may attach material is decided at the staff boundary instead.
 */
@Injectable()
export class RightsClearance {
  private readonly now: () => string;

  constructor(
    private readonly rightsRepository: RightsRepository,
    options: RightsClearanceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /**
   * Finds the grant covering this use, among however many cover the material.
   *
   * Material is routinely licensed more than once — publishing under one
   * contract, AI use under another — so one grant refusing a use is not the
   * answer while another covers it. Grants are tried most recently recorded
   * first, so the refusal reported is the one an editor most likely just
   * entered rather than whichever happens to be oldest.
   */
  async clear(
    request: MaterialUseRequest,
  ): Promise<WorkflowMaterialAttachment> {
    const stated = statedUse(request);
    const usedAt = this.now();
    const records = await this.rightsRepository.listForMaterial(
      stated.material,
    );
    let refusal: unknown;

    for (const rightsRecord of records) {
      try {
        return clearMaterialForWorkflowUse({ ...stated, rightsRecord, usedAt });
      } catch (error) {
        refusal ??= error;
      }
    }

    return domainRule(() => {
      if (refusal) {
        throw refusal;
      }

      // Nothing covers the material at all: the gate says so in its own words.
      return clearMaterialForWorkflowUse({
        ...stated,
        rightsRecord: undefined,
        usedAt,
      });
    });
  }
}

/**
 * Reads the use a request states. The domain refuses these too, so this is not
 * the rule but the answer an editor can act on: a request that names no
 * material cannot be told which grant was missing.
 */
function statedUse(request: MaterialUseRequest): {
  material: WorkflowMaterial;
  use: RightsUse;
  territory: string;
  modifies: boolean;
} {
  const kind = request.material?.kind;
  const { use, territory } = request;

  if (
    !request.material?.id?.trim() ||
    !kind ||
    !WORKFLOW_MATERIAL_KINDS.includes(kind) ||
    !use ||
    !RIGHTS_USES.includes(use) ||
    !territory?.trim()
  ) {
    throw new BadRequestException(
      `using workflow material needs a material id, a kind (${WORKFLOW_MATERIAL_KINDS.join(", ")}), a use (${RIGHTS_USES.join(", ")}), and the territory the use happens in`,
    );
  }

  return {
    material: { id: request.material.id, kind },
    use,
    territory,
    modifies: request.modifies === true,
  };
}
