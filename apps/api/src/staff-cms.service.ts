import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  amendCanon,
  attachWorkflowMaterial,
  authorChapterDraft,
  chapterDraftProvenance,
  createSeries,
  createStoryBible,
  lockStoryBible,
  seriesProvenance,
  storyBibleProvenance,
  updateSeries,
  type CanonEntry,
  type ChapterDraft,
  type RequestPrincipal,
  type RightsUse,
  type Series,
  type StoryBible,
  type WorkflowMaterial,
} from "@novelx/shared";

import { domainRule } from "./domain-rule.js";
import { requireChapterDraft, requireSeries } from "./governed-content.js";
import { ProvenanceRecorder } from "./provenance-recorder.js";
import { RightsClearance } from "./rights-clearance.js";
import {
  staffAuditTarget,
  type StaffOperation,
  StaffOperationGate,
} from "./staff-operation-gate.js";
import type { StaffCmsRepository } from "./staff-cms.repository.js";

/** What an editor sees of one governed Series: its metadata, canon, and drafts. */
export type CmsSeriesView = {
  series: Series;
  storyBible?: StoryBible;
  chapterDrafts: ChapterDraft[];
};

export type StaffCmsServiceOptions = {
  now?: () => string;
};

/**
 * The staff CMS: where a Series becomes governed content.
 *
 * Every operation goes through the staff operation gate, so an editor's write
 * is authorized against the Staff Account directory and recorded in the staff
 * audit trail before it happens. Domain rules — Managed Taxonomy, human-owned
 * Canon, draft attachment — live in the domain and are translated to HTTP here.
 *
 * A write that lands is then appended to the Provenance Ledger, so how a Series,
 * its Canon, and its Chapters came to be what they are can be traced afterwards
 * (ADR-0008). The two trails answer different questions: the audit trail keeps
 * every attempt, including refused ones, and the ledger keeps what content
 * changes actually happened.
 */
@Injectable()
export class StaffCmsService {
  private readonly now: () => string;

  constructor(
    private readonly gate: StaffOperationGate,
    private readonly staffCmsRepository: StaffCmsRepository,
    private readonly rightsClearance: RightsClearance,
    private readonly provenanceRecorder: ProvenanceRecorder,
    options: StaffCmsServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async createSeries(input: {
    principal: RequestPrincipal;
    series: Omit<Series, "status"> & { status?: Series["status"] };
  }): Promise<Series> {
    return this.gate.run(
      input.principal,
      this.seriesOperation("create", input.series?.id),
      async (actor) => {
        const series = domainRule(() => createSeries(input.series));

        if (await this.staffCmsRepository.findSeries(series.id)) {
          throw new ConflictException(
            `the CMS already holds a Series called ${series.id}`,
          );
        }

        await this.staffCmsRepository.saveSeries(series);
        await this.provenanceRecorder.record({
          actor,
          action: "series.create",
          subject: seriesProvenance(series),
        });

        return series;
      },
    );
  }

  async updateSeries(input: {
    principal: RequestPrincipal;
    seriesId: string;
    changes: Partial<Omit<Series, "id">>;
  }): Promise<Series> {
    return this.gate.run(
      input.principal,
      this.seriesOperation("update", input.seriesId),
      async (actor) => {
        const series = await requireSeries(
          this.staffCmsRepository,
          input.seriesId,
        );
        const updated = domainRule(() =>
          updateSeries({ series, changes: input.changes ?? {} }),
        );

        await this.staffCmsRepository.saveSeries(updated);
        await this.provenanceRecorder.record({
          actor,
          action: "series.update",
          subject: seriesProvenance(updated),
        });

        return updated;
      },
    );
  }

  async readSeries(input: {
    principal: RequestPrincipal;
    seriesId: string;
  }): Promise<CmsSeriesView> {
    return this.gate.run(
      input.principal,
      this.seriesOperation("read", input.seriesId),
      async () => {
        const series = await requireSeries(
          this.staffCmsRepository,
          input.seriesId,
        );
        const [storyBible, chapterDrafts] = await Promise.all([
          this.staffCmsRepository.findStoryBible(series.id),
          this.staffCmsRepository.listChapterDrafts(series.id),
        ]);

        return { series, ...(storyBible ? { storyBible } : {}), chapterDrafts };
      },
    );
  }

  /**
   * Defines the Canon of a Series, starting its Story Bible if it has none.
   *
   * A reason is what makes a change to locked Canon accountable rather than
   * silent, so the domain refuses one without it and the refusal is a conflict
   * the editor can act on, not a validation error.
   */
  async amendStoryBible(input: {
    principal: RequestPrincipal;
    seriesId: string;
    canon: readonly CanonEntry[];
    reason?: string;
  }): Promise<StoryBible> {
    return this.gate.run(
      input.principal,
      {
        ...this.storyBibleOperation("amend", input.seriesId),
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      },
      async (actor) => {
        // A body that simply omits canon must not be read as "make it empty":
        // that would erase a Series canon by leaving a field out.
        if (!Array.isArray(input.canon)) {
          throw new BadRequestException(
            "amending a Story Bible requires canon as a list of entries; send [] to clear it",
          );
        }

        const series = await requireSeries(
          this.staffCmsRepository,
          input.seriesId,
        );
        const existing = await this.staffCmsRepository.findStoryBible(
          series.id,
        );

        const amended = domainRule(() =>
          amendCanon({
            storyBible:
              existing ?? createStoryBible({ seriesId: series.id, actor }),
            canon: input.canon,
            actor,
            ...(input.reason === undefined ? {} : { reason: input.reason }),
          }),
        );

        await this.staffCmsRepository.saveStoryBible(amended);
        await this.provenanceRecorder.record({
          actor,
          action: "story-bible.amend",
          subject: storyBibleProvenance(amended),
        });

        return amended;
      },
    );
  }

  async lockStoryBible(input: {
    principal: RequestPrincipal;
    seriesId: string;
  }): Promise<StoryBible> {
    return this.gate.run(
      input.principal,
      this.storyBibleOperation("lock", input.seriesId),
      async (actor) => {
        const series = await requireSeries(
          this.staffCmsRepository,
          input.seriesId,
        );
        const storyBible = await this.staffCmsRepository.findStoryBible(
          series.id,
        );

        if (!storyBible) {
          throw new NotFoundException(
            `Series ${series.id} has no Story Bible to lock`,
          );
        }

        const locked = domainRule(() =>
          lockStoryBible({ storyBible, actor, lockedAt: this.now() }),
        );
        await this.staffCmsRepository.saveStoryBible(locked);

        // Locking a Story Bible that is already in production use changes
        // nothing, and a line of lineage for a change that did not happen is
        // worse than none.
        if (locked !== storyBible) {
          await this.provenanceRecorder.record({
            actor,
            action: "story-bible.lock",
            subject: storyBibleProvenance(locked),
          });
        }

        return locked;
      },
    );
  }

  async authorChapterDraft(input: {
    principal: RequestPrincipal;
    seriesId: string;
    draft: {
      id: string;
      chapterNumber: number;
      title: string;
      body: string;
      creativeDisclosure?: Series["creativeDisclosure"];
    };
  }): Promise<ChapterDraft> {
    return this.gate.run(
      input.principal,
      {
        action: "staff.chapter-draft.author",
        target: staffAuditTarget("chapter-draft", input.draft?.id),
        permission: "chapter:write",
      },
      async (actor) => {
        const series = await requireSeries(
          this.staffCmsRepository,
          input.seriesId,
        );
        const draft = domainRule(() =>
          authorChapterDraft({ ...input.draft, series }),
        );

        await this.assertChapterIsFree(draft);
        await this.staffCmsRepository.saveChapterDraft(draft);
        await this.provenanceRecorder.record({
          actor,
          action: "chapter-draft.author",
          subject: chapterDraftProvenance(draft),
        });

        return draft;
      },
    );
  }

  /**
   * Attaches material to the workflow carrying a draft Chapter, if a Rights
   * Record covers that use of it.
   *
   * This is the gate ADR-0007 asks for, placed where material enters a workflow
   * rather than at the publishing door: an AI workflow that has already read an
   * unlicensed dataset cannot be un-run by refusing to publish afterwards.
   */
  async attachWorkflowMaterial(input: {
    principal: RequestPrincipal;
    seriesId: string;
    chapterId: string;
    material: WorkflowMaterial;
    use: RightsUse;
    territory: string;
    modifies?: boolean;
  }): Promise<ChapterDraft> {
    return this.gate.run(
      input.principal,
      {
        action: "staff.chapter-draft.attach-material",
        target: staffAuditTarget("chapter-draft", input.chapterId),
        permission: "chapter:write",
      },
      async (actor) => {
        const draft = await requireChapterDraft(this.staffCmsRepository, input);
        const attachment = await this.rightsClearance.clear(input);

        const attached = domainRule(() =>
          attachWorkflowMaterial({ draft, attachment }),
        );
        await this.staffCmsRepository.saveChapterDraft(attached);
        await this.provenanceRecorder.record({
          actor,
          action: "chapter-draft.attach-material",
          subject: chapterDraftProvenance(attached),
        });

        return attached;
      },
    );
  }

  /**
   * Chapter order is what a reader follows, so two drafts cannot claim the same
   * place in a Series, and a draft cannot quietly overwrite an existing one.
   */
  private async assertChapterIsFree(draft: ChapterDraft): Promise<void> {
    const drafts = await this.staffCmsRepository.listChapterDrafts(
      draft.seriesId,
    );
    const clash = drafts.find(
      (existing) =>
        existing.id === draft.id ||
        existing.chapterNumber === draft.chapterNumber,
    );

    if (clash) {
      throw new ConflictException(
        `Series ${draft.seriesId} already holds a draft Chapter ${clash.chapterNumber} (${clash.id})`,
      );
    }
  }

  private seriesOperation(
    action: "create" | "update" | "read",
    seriesId: unknown,
  ): StaffOperation {
    return {
      action: `staff.series.${action}`,
      target: staffAuditTarget("series", seriesId),
      permission: action === "read" ? "series:read" : "series:write",
    };
  }

  private storyBibleOperation(
    action: "amend" | "lock",
    seriesId: unknown,
  ): StaffOperation {
    return {
      action: `staff.story-bible.${action}`,
      target: staffAuditTarget("story-bible", seriesId),
      permission: "canon:write",
    };
  }
}
