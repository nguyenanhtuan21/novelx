import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  amendCanon,
  authorChapterDraft,
  CANON_CHANGE_REQUIRES_REASON,
  createSeries,
  createStoryBible,
  LockedCanonError,
  lockStoryBible,
  StaffAccessDeniedError,
  updateSeries,
  type CanonEntry,
  type ChapterDraft,
  type RequestPrincipal,
  type Series,
  type StoryBible,
} from "@novelx/shared";

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

/**
 * Translates a broken domain rule into the answer an editor can act on: a bad
 * request for prose or metadata they can fix, a conflict for locked Canon they
 * must explain. A refusal the boundary already decided passes through
 * untouched, so an authorization failure never softens into a 400.
 */
function domainRule<T>(apply: () => T): T {
  try {
    return apply();
  } catch (error) {
    if (
      error instanceof HttpException ||
      error instanceof StaffAccessDeniedError
    ) {
      throw error;
    }

    if (error instanceof LockedCanonError) {
      throw new ConflictException({
        error: CANON_CHANGE_REQUIRES_REASON,
        message: error.message,
      });
    }

    throw error instanceof Error
      ? new BadRequestException(error.message)
      : error;
  }
}
