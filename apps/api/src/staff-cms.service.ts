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
  clearMaterialForWorkflowUse,
  createSeries,
  createStoryBible,
  lockStoryBible,
  updateSeries,
  type CanonEntry,
  type ChapterDraft,
  type RequestPrincipal,
  type RightsUse,
  type Series,
  type StoryBible,
  type WorkflowMaterial,
  type WorkflowMaterialAttachment,
} from "@novelx/shared";

import { domainRule } from "./domain-rule.js";
import type { RightsRepository } from "./rights.repository.js";
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
 */
@Injectable()
export class StaffCmsService {
  private readonly now: () => string;

  constructor(
    private readonly gate: StaffOperationGate,
    private readonly staffCmsRepository: StaffCmsRepository,
    private readonly rightsRepository: RightsRepository,
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
      async () => {
        const series = domainRule(() => createSeries(input.series));

        if (await this.staffCmsRepository.findSeries(series.id)) {
          throw new ConflictException(
            `the CMS already holds a Series called ${series.id}`,
          );
        }

        await this.staffCmsRepository.saveSeries(series);

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
      async () => {
        const series = await this.requireSeries(input.seriesId);
        const updated = domainRule(() =>
          updateSeries({ series, changes: input.changes ?? {} }),
        );

        await this.staffCmsRepository.saveSeries(updated);

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
        const series = await this.requireSeries(input.seriesId);
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

        const series = await this.requireSeries(input.seriesId);
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
        const series = await this.requireSeries(input.seriesId);
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
      async () => {
        const series = await this.requireSeries(input.seriesId);
        const draft = domainRule(() =>
          authorChapterDraft({ ...input.draft, series }),
        );

        await this.assertChapterIsFree(draft);
        await this.staffCmsRepository.saveChapterDraft(draft);

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
      async () => {
        const request = this.readMaterialRequest(input);
        const draft = await this.requireChapterDraft(input);
        const attachment = await this.clearMaterial(request);

        const attached = domainRule(() =>
          attachWorkflowMaterial({ draft, attachment }),
        );
        await this.staffCmsRepository.saveChapterDraft(attached);

        return attached;
      },
    );
  }

  /**
   * Finds the grant that covers this use, among however many cover the material.
   *
   * Material is routinely licensed more than once — publishing under one
   * contract, AI use under another — so a single record failing is not an
   * answer. Only when none of them covers the use is the use refused, and the
   * refusal reported is the first grant's, which is the one an editor is most
   * likely to be looking at.
   */
  private async clearMaterial(request: {
    material: WorkflowMaterial;
    use: RightsUse;
    territory: string;
    modifies: boolean;
  }): Promise<WorkflowMaterialAttachment> {
    const usedAt = this.now();
    const records = await this.rightsRepository.listForMaterial(
      request.material,
    );
    let refusal: unknown;

    for (const rightsRecord of records) {
      try {
        return clearMaterialForWorkflowUse({
          ...request,
          rightsRecord,
          usedAt,
        });
      } catch (error) {
        refusal ??= error;
      }
    }

    return domainRule(() => {
      if (refusal) {
        throw refusal;
      }

      return clearMaterialForWorkflowUse({
        ...request,
        rightsRecord: undefined,
        usedAt,
      });
    });
  }

  /** Reads the material an editor named, before any of it is trusted. */
  private readMaterialRequest(input: {
    material: WorkflowMaterial;
    use: RightsUse;
    territory: string;
    modifies?: boolean;
  }): {
    material: WorkflowMaterial;
    use: RightsUse;
    territory: string;
    modifies: boolean;
  } {
    const kinds: WorkflowMaterial["kind"][] = [
      "asset",
      "dataset",
      "reference",
      "source-material",
    ];
    const uses: RightsUse[] = ["ai-workflow", "publishing"];

    if (
      !input.material?.id?.trim() ||
      !kinds.includes(input.material?.kind) ||
      !uses.includes(input.use) ||
      !input.territory?.trim()
    ) {
      throw new BadRequestException(
        `attaching workflow material needs a material id, a kind (${kinds.join(", ")}), a use (${uses.join(", ")}), and the territory the use happens in`,
      );
    }

    return {
      material: { id: input.material.id, kind: input.material.kind },
      use: input.use,
      territory: input.territory,
      modifies: input.modifies === true,
    };
  }

  private async requireChapterDraft(input: {
    seriesId: string;
    chapterId: string;
  }): Promise<ChapterDraft> {
    const series = await this.requireSeries(input.seriesId);
    const draft = await this.staffCmsRepository.findChapterDraft(
      input.chapterId,
    );

    if (!draft || draft.seriesId !== series.id) {
      throw new NotFoundException(
        `Series ${series.id} holds no draft Chapter called ${input.chapterId}`,
      );
    }

    return draft;
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

  private async requireSeries(seriesId: string): Promise<Series> {
    const series = await this.staffCmsRepository.findSeries(seriesId);

    if (!series) {
      throw new NotFoundException(`the CMS holds no Series called ${seriesId}`);
    }

    return series;
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
