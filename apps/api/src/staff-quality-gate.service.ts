import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  chapterDraftProvenance,
  evaluateQualityGate,
  REPORTED_QUALITY_GATE_CONDITIONS,
  type QualityGateResult,
  type ReportedQualityCheck,
  type RequestPrincipal,
} from "@novelx/shared";

import { domainRule } from "./domain-rule.js";
import { requireChapterDraft } from "./governed-content.js";
import { ProvenanceRecorder } from "./provenance-recorder.js";
import type { ProvenanceRepository } from "./provenance.repository.js";
import type { RightsRepository } from "./rights.repository.js";
import type { StaffCmsRepository } from "./staff-cms.repository.js";
import {
  staffAuditTarget,
  StaffOperationGate,
} from "./staff-operation-gate.js";

/**
 * How much lineage the gate reads. It only has to know that the Provenance
 * Ledger can say how this draft was made, so the newest entry answers the
 * condition and there is no reason to pull a draft's whole history to do it.
 */
const QUALITY_GATE_LINEAGE_LIMIT = 1;

export type StaffQualityGateServiceOptions = {
  now?: () => string;
};

/**
 * Where staff run the Quality Gate over a draft Chapter, and read what it found.
 *
 * Running it is its own privileged operation: the four conditions nobody can
 * read off a record arrive as reported checks, so declaring what the content
 * checks found is an accountable act, audited and attributed like any other.
 * The three conditions the record answers are looked up here — the grant the
 * draft names, the lineage the ledger holds, the approval on the draft — and
 * handed to the domain, which is what keeps a caller from reporting them.
 *
 * A run is a content evaluation, so it appends a line of lineage naming what it
 * concluded (ADR-0008). Reading a result appends nothing.
 */
@Injectable()
export class StaffQualityGateService {
  private readonly now: () => string;

  constructor(
    private readonly gate: StaffOperationGate,
    private readonly staffCmsRepository: StaffCmsRepository,
    private readonly rightsRepository: RightsRepository,
    private readonly provenanceRepository: ProvenanceRepository,
    private readonly provenanceRecorder: ProvenanceRecorder,
    options: StaffQualityGateServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async runQualityGate(input: {
    principal: RequestPrincipal;
    seriesId: string;
    chapterId: string;
    reportedChecks: unknown;
  }): Promise<QualityGateResult> {
    return this.gate.run(
      input.principal,
      {
        action: "staff.quality-gate.run",
        target: staffAuditTarget("chapter-draft", input.chapterId),
        permission: "chapter:quality-gate",
      },
      async (actor) => {
        const reportedChecks = statedChecks(input.reportedChecks);
        const draft = await requireChapterDraft(this.staffCmsRepository, input);
        const [chapterRightsRecord, lineage] = await Promise.all([
          draft.rightsRecordId
            ? this.rightsRepository.find(draft.rightsRecordId)
            : undefined,
          this.provenanceRepository.listForTarget({
            target: {
              kind: "chapter-draft",
              id: draft.id,
              seriesId: draft.seriesId,
            },
            limit: QUALITY_GATE_LINEAGE_LIMIT,
          }),
        ]);

        const result = domainRule(() =>
          evaluateQualityGate({
            draft,
            ...(chapterRightsRecord ? { chapterRightsRecord } : {}),
            lineage,
            reportedChecks,
            evaluatedAt: this.now(),
          }),
        );

        const evaluated = { ...draft, qualityGate: result };
        await this.staffCmsRepository.saveChapterDraft(evaluated);
        await this.provenanceRecorder.record({
          actor,
          action: "chapter-draft.quality-gate",
          subject: chapterDraftProvenance(evaluated),
        });

        return result;
      },
    );
  }

  /**
   * What the gate last concluded about a draft Chapter. A draft the gate has
   * not run on holds no result, which is the honest state of a fresh draft
   * rather than one that passed nothing.
   */
  async readQualityGate(input: {
    principal: RequestPrincipal;
    seriesId: string;
    chapterId: string;
  }): Promise<QualityGateResult> {
    return this.gate.run(
      input.principal,
      {
        action: "staff.quality-gate.read",
        target: staffAuditTarget("chapter-draft", input.chapterId),
        permission: "series:read",
      },
      async () => {
        const draft = await requireChapterDraft(this.staffCmsRepository, input);

        if (!draft.qualityGate) {
          throw new NotFoundException(
            `the Quality Gate has not run on draft Chapter ${draft.id}`,
          );
        }

        return draft.qualityGate;
      },
    );
  }
}

/**
 * Reads the checks a run reports, without letting a shapeless body become a
 * verdict. What each check says is the domain's to refuse; that they arrived as
 * checks at all is answered here, so a caller sending prose is told so.
 */
function statedChecks(reported: unknown): readonly ReportedQualityCheck[] {
  if (!Array.isArray(reported)) {
    throw new BadRequestException(
      `running the Quality Gate needs reportedChecks as a list of { condition, verdict }, for: ${REPORTED_QUALITY_GATE_CONDITIONS.join(", ")}`,
    );
  }

  return reported.map((check) => {
    const stated = (check ?? {}) as Partial<ReportedQualityCheck>;

    return {
      condition: stated.condition as ReportedQualityCheck["condition"],
      verdict: stated.verdict as ReportedQualityCheck["verdict"],
      ...(stated.score === undefined ? {} : { score: stated.score }),
      ...(typeof stated.note === "string" ? { note: stated.note } : {}),
    };
  });
}
