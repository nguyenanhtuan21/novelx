import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  PROVENANCE_TARGET_KINDS,
  type ProvenanceEntry,
  type ProvenanceTargetKind,
  type RequestPrincipal,
} from "@novelx/shared";

import { pageSize } from "./page-size.js";
import type { ProvenanceRepository } from "./provenance.repository.js";
import type { StaffCmsRepository } from "./staff-cms.repository.js";
import {
  staffAuditTarget,
  StaffOperationGate,
} from "./staff-operation-gate.js";

export const PROVENANCE_PAGE_SIZE = 50;
export const PROVENANCE_MAX_PAGE_SIZE = 500;

/**
 * Where staff inspect how content was made: the lineage of a Series, its Story
 * Bible, a draft Chapter, or a publish operation.
 *
 * Reading lineage is privileged work — it is the record of who and what shaped
 * the catalog — so it asks for `provenance:read` and is audited like any other
 * staff operation. Reading changes no content, so it appends no entry of its
 * own: the ledger is the trail of content, not of the looking at it.
 */
@Injectable()
export class StaffProvenanceService {
  constructor(
    private readonly gate: StaffOperationGate,
    private readonly provenanceRepository: ProvenanceRepository,
    private readonly staffCmsRepository: StaffCmsRepository,
  ) {}

  async readSeriesProvenance(input: {
    principal: RequestPrincipal;
    seriesId: string;
    limit?: number;
  }): Promise<{ entries: ProvenanceEntry[] }> {
    return this.gate.run(
      input.principal,
      {
        action: "staff.provenance.read",
        target: staffAuditTarget("series", input.seriesId),
        permission: "provenance:read",
      },
      async () => {
        await this.requireSeries(input.seriesId);

        return {
          entries: await this.provenanceRepository.listForSeries({
            seriesId: input.seriesId,
            limit: provenancePageSize(input.limit),
          }),
        };
      },
    );
  }

  async readTargetProvenance(input: {
    principal: RequestPrincipal;
    seriesId: string;
    targetKind: string;
    targetId: string;
    limit?: number;
  }): Promise<{ entries: ProvenanceEntry[] }> {
    // The kind is read before the gate so that an unrecognised one cannot write
    // itself into the audit trail, and refused before any lookup so that it is
    // still an attempt the audit trail keeps.
    const kind = tracedKind(input.targetKind);

    return this.gate.run(
      input.principal,
      {
        action: "staff.provenance.read",
        target: staffAuditTarget(kind ?? "provenance", input.targetId),
        permission: "provenance:read",
      },
      async () => {
        if (!kind) {
          throw new BadRequestException(
            `the Provenance Ledger traces ${PROVENANCE_TARGET_KINDS.join(", ")}, not ${input.targetKind}`,
          );
        }

        await this.requireSeries(input.seriesId);

        return {
          entries: await this.provenanceRepository.listForTarget({
            seriesId: input.seriesId,
            kind,
            id: input.targetId,
            limit: provenancePageSize(input.limit),
          }),
        };
      },
    );
  }

  /**
   * Lineage is read under the Series that holds it, so an unknown Series is
   * answered as unknown rather than as a Series nothing ever happened to.
   */
  private async requireSeries(seriesId: string): Promise<void> {
    if (!(await this.staffCmsRepository.findSeries(seriesId))) {
      throw new NotFoundException(`the CMS holds no Series called ${seriesId}`);
    }
  }
}

/** The artifact kind a request named, or nothing when the ledger traces no such thing. */
function tracedKind(targetKind: string): ProvenanceTargetKind | undefined {
  return PROVENANCE_TARGET_KINDS.find((kind) => kind === targetKind);
}

function provenancePageSize(limit: number | undefined): number {
  return pageSize(limit, {
    fallback: PROVENANCE_PAGE_SIZE,
    max: PROVENANCE_MAX_PAGE_SIZE,
  });
}
