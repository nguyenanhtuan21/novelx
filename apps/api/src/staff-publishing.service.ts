import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import {
  approveChapterDraft,
  chapterDraftProvenance,
  publishChapter,
  publishedSnapshotProvenance,
  scheduleChapterPublication,
  type ChapterDraft,
  type ChapterPublicationSchedule,
  type PublishedSnapshot,
  type RequestPrincipal,
} from "@novelx/shared";

import { domainRule } from "./domain-rule.js";
import { requireSeriesChapter } from "./governed-content.js";
import { ProvenanceRecorder } from "./provenance-recorder.js";
import type { ProvenanceRepository } from "./provenance.repository.js";
import type { PublishingRepository } from "./publishing.repository.js";
import type { StaffCmsRepository } from "./staff-cms.repository.js";
import {
  staffAuditTarget,
  StaffOperationGate,
} from "./staff-operation-gate.js";

/**
 * How much lineage the publishing door reads. A Published Snapshot names the
 * lineage entry its content traced when it went public, so the newest entry for
 * the draft is the one it wants, and pulling a whole history to take the first
 * of it would be work for nothing.
 */
const PUBLISHING_LINEAGE_LIMIT = 1;

export type StaffPublishingServiceOptions = {
  now?: () => string;
};

/**
 * Where a draft Chapter becomes something readers can open: approved by an
 * accountable human, scheduled, and published as an immutable snapshot.
 *
 * The three are separate operations under separate permissions, because they
 * are separate authorities. `chapter:approve` is taking responsibility for the
 * content and `chapter:publish` is putting it in front of readers; an editor
 * holding `chapter:write` holds neither, so the person who wrote a Chapter is
 * not by that fact the person who signed it off.
 *
 * Approving and publishing change content, so each appends a line of lineage
 * (ADR-0008). Scheduling does not: it records an intention, which belongs to
 * the Staff Audit Record with the rest of what operators did.
 */
@Injectable()
export class StaffPublishingService {
  private readonly now: () => string;

  constructor(
    private readonly gate: StaffOperationGate,
    private readonly staffCmsRepository: StaffCmsRepository,
    private readonly publishingRepository: PublishingRepository,
    private readonly provenanceRepository: ProvenanceRepository,
    private readonly provenanceRecorder: ProvenanceRecorder,
    options: StaffPublishingServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async approveChapter(input: {
    principal: RequestPrincipal;
    seriesId: string;
    chapterId: string;
  }): Promise<ChapterDraft> {
    return this.gate.run(
      input.principal,
      {
        action: "staff.chapter-draft.approve",
        target: staffAuditTarget("chapter-draft", input.chapterId),
        permission: "chapter:approve",
      },
      async (actor) => {
        const { draft } = await requireSeriesChapter(
          this.staffCmsRepository,
          input,
        );
        const approved = domainRule(() =>
          approveChapterDraft({ draft, actor, approvedAt: this.now() }),
        );

        await this.staffCmsRepository.saveChapterDraft(approved);

        // Re-approving changes nothing, and a line of lineage for a change that
        // did not happen would name a second reviewer the record does not hold.
        if (approved !== draft) {
          await this.provenanceRecorder.record({
            actor,
            action: "chapter-draft.approve",
            subject: chapterDraftProvenance(approved),
          });
        }

        return approved;
      },
    );
  }

  async scheduleChapter(input: {
    principal: RequestPrincipal;
    seriesId: string;
    chapterId: string;
    scheduledFor: unknown;
  }): Promise<ChapterPublicationSchedule> {
    return this.gate.run(
      input.principal,
      {
        action: "staff.chapter-publication.schedule",
        target: staffAuditTarget("chapter-draft", input.chapterId),
        permission: "chapter:publish",
      },
      async (actor) => {
        if (typeof input.scheduledFor !== "string") {
          throw new BadRequestException(
            "scheduling a Chapter needs scheduledFor as the time it becomes public",
          );
        }

        const { series, draft } = await requireSeriesChapter(
          this.staffCmsRepository,
          input,
        );
        const schedule = domainRule(() =>
          scheduleChapterPublication({
            series,
            draft,
            actor,
            scheduledFor: input.scheduledFor as string,
            scheduledAt: this.now(),
          }),
        );

        await this.publishingRepository.schedule(schedule);

        return schedule;
      },
    );
  }

  /**
   * Publishes a Chapter, against what the Series already shows readers.
   *
   * Sequence and due time are read here rather than asked of the caller: the
   * Chapters readers can see come from the published record, and the schedule
   * from the one on file, so an operator cannot publish out of order or early
   * by leaving something out of the request.
   */
  async publishChapter(input: {
    principal: RequestPrincipal;
    seriesId: string;
    chapterId: string;
  }): Promise<PublishedSnapshot> {
    return this.gate.run(
      input.principal,
      {
        action: "staff.chapter-publication.publish",
        target: staffAuditTarget("chapter-draft", input.chapterId),
        permission: "chapter:publish",
      },
      async (actor) => {
        const { series, draft } = await requireSeriesChapter(
          this.staffCmsRepository,
          input,
        );
        const [published, schedule, lineage] = await Promise.all([
          this.publishingRepository.listPublishedChapters(series.id),
          this.publishingRepository.findSchedule(draft.id),
          this.provenanceRepository.listForTarget({
            target: {
              kind: "chapter-draft",
              id: draft.id,
              seriesId: draft.seriesId,
            },
            limit: PUBLISHING_LINEAGE_LIMIT,
          }),
        ]);

        const snapshot = domainRule(() =>
          publishChapter({
            series,
            draft,
            actor,
            publishedChapterNumbers: published.map(
              (chapter) => chapter.chapterNumber,
            ),
            lineage,
            ...(schedule ? { schedule } : {}),
            publishedAt: this.now(),
          }),
        );

        // The domain refuses a Chapter the Series already shows, and the
        // repository refuses a version it already holds. Two operators
        // publishing at once can both pass the first and only one the second.
        if (
          (await this.publishingRepository.publish(snapshot)) !== "published"
        ) {
          throw new ConflictException(
            `Chapter ${snapshot.chapterNumber} of Series ${series.id} is already published`,
          );
        }

        await this.provenanceRecorder.record({
          actor,
          action: "published-snapshot.publish",
          subject: publishedSnapshotProvenance(snapshot),
        });

        return snapshot;
      },
    );
  }
}
