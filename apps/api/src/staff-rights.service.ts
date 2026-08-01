import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  createRightsRecord,
  type RequestPrincipal,
  type RightsDuration,
  type RightsEvidence,
  type RightsRecord,
  type RightsUse,
  type WorkflowMaterial,
} from "@novelx/shared";

import { domainRule } from "./domain-rule.js";
import type { RightsRepository } from "./rights.repository.js";
import {
  staffAuditTarget,
  StaffOperationGate,
} from "./staff-operation-gate.js";

/** A Rights Record as a request states it, before any of it is believed. */
export type RightsRecordRequest = {
  id?: string;
  material?: Partial<WorkflowMaterial>;
  owner?: string;
  scope?: readonly RightsUse[];
  territories?: readonly string[];
  duration?: Partial<RightsDuration>;
  modificationAllowed?: boolean;
  aiUseAllowed?: boolean;
  evidence?: Partial<RightsEvidence>;
};

export type StaffRightsServiceOptions = {
  now?: () => string;
};

/**
 * Where staff record what NovelX is allowed to do with workflow material.
 *
 * Recording rights is its own privileged operation rather than a field on the
 * material, because everything downstream — AI workflows, publishing, the
 * Quality Gate — is trusting this record. It is written by an accountable
 * Staff Account holding `rights:write` and audited like any other staff work.
 */
@Injectable()
export class StaffRightsService {
  private readonly now: () => string;

  constructor(
    private readonly gate: StaffOperationGate,
    private readonly rightsRepository: RightsRepository,
    options: StaffRightsServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async recordRights(input: {
    principal: RequestPrincipal;
    rightsRecord: RightsRecordRequest;
  }): Promise<RightsRecord> {
    return this.gate.run(
      input.principal,
      {
        action: "staff.rights-record.create",
        target: staffAuditTarget("rights-record", input.rightsRecord?.id),
        permission: "rights:write",
      },
      async (actor) => {
        const record = domainRule(() =>
          createRightsRecord({
            ...statedGrant(input.rightsRecord),
            actor,
            recordedAt: this.now(),
          }),
        );

        // A Rights Record is what later uses are trusted to, so it is written
        // once rather than quietly replaced: a grant that has genuinely changed
        // is a new record, and the old one stays as the evidence of what was
        // relied on at the time.
        if (await this.rightsRepository.find(record.id)) {
          throw new ConflictException(
            `a Rights Record called ${record.id} is already held`,
          );
        }

        await this.rightsRepository.save(record);

        return record;
      },
    );
  }

  async readRightsRecord(input: {
    principal: RequestPrincipal;
    rightsRecordId: string;
  }): Promise<RightsRecord> {
    return this.gate.run(
      input.principal,
      {
        action: "staff.rights-record.read",
        target: staffAuditTarget("rights-record", input.rightsRecordId),
        permission: "rights:read",
      },
      async () => {
        const record = await this.rightsRepository.find(input.rightsRecordId);

        if (!record) {
          throw new NotFoundException(
            `no Rights Record called ${input.rightsRecordId} is held`,
          );
        }

        return record;
      },
    );
  }
}

/**
 * Reads the grant a request states, without letting an absent field become a
 * permission: a missing list arrives empty and a missing permission arrives
 * `false`, so the domain refuses to grant what nobody granted.
 */
function statedGrant(
  request: RightsRecordRequest,
): Omit<Parameters<typeof createRightsRecord>[0], "actor" | "recordedAt"> {
  if (!request?.id?.trim()) {
    throw new BadRequestException("a Rights Record needs an id");
  }

  return {
    id: request.id,
    material: {
      id: request.material?.id ?? "",
      kind: request.material?.kind as WorkflowMaterial["kind"],
    },
    owner: request.owner ?? "",
    scope: Array.isArray(request.scope) ? request.scope : [],
    territories: Array.isArray(request.territories) ? request.territories : [],
    duration: {
      from: request.duration?.from ?? "",
      ...(request.duration?.until ? { until: request.duration.until } : {}),
    },
    modificationAllowed: request.modificationAllowed === true,
    aiUseAllowed: request.aiUseAllowed === true,
    evidence: {
      kind: request.evidence?.kind as RightsEvidence["kind"],
      reference: request.evidence?.reference ?? "",
    },
  };
}
