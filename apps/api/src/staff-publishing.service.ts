import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import {
  approveChapterDraft,
  chapterDraftProvenance,
  PublicationRefusedError,
  publishChapter,
  publishedSnapshotProvenance,
  revisePublishedChapter,
  scheduleChapterPublication,
  takeDownPublishedChapter,
  type ChapterDraft,
  type ChapterPublicationSchedule,
  type ChapterTakedown,
  type PublishedSnapshot,
  type RequestPrincipal,
  type StaffPrincipal,
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
 * Everything NovelX has published of one Chapter, and whether it is still
 * distributing it: the evidence a revision or a takedown is answered for by.
 */
export type ChapterPublicationRecord = {
  chapterId: string;
  /** Every version, newest first. Nothing is ever taken out of this. */
  versions: PublishedSnapshot[];
  takedown?: ChapterTakedown;
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
        const [publishedChapterNumbers, schedule, lineage] = await Promise.all([
          this.publishingRepository.publishedChapterNumbers(series.id),
          this.publishingRepository.findSchedule(draft.id),
          this.draftLineage(draft),
        ]);

        const snapshot = domainRule(() =>
          publishChapter({
            series,
            draft,
            actor,
            publishedChapterNumbers,
            lineage,
            ...(schedule ? { schedule } : {}),
            publishedAt: this.now(),
          }),
        );

        return this.publishSnapshot({
          actor,
          snapshot,
          action: "published-snapshot.publish",
        });
      },
    );
  }

  /**
   * Fixes a Chapter after publication by publishing a further version of it.
   *
   * The snapshot readers saw is read and left alone (ADR-0003): the fix is a new
   * version carrying the reason and the snapshot it replaced, so the public text
   * and why it changed are answerable from the same record afterwards.
   */
  async reviseChapter(input: {
    principal: RequestPrincipal;
    seriesId: string;
    chapterId: string;
    reason: unknown;
  }): Promise<PublishedSnapshot> {
    const reason = requiredReason(
      input.reason,
      "revising a published Chapter needs the reason it was fixed",
    );

    return this.gate.run(
      input.principal,
      {
        action: "staff.published-chapter.revise",
        target: staffAuditTarget("published-chapter", input.chapterId),
        permission: "chapter:publish",
        reason,
      },
      async (actor) => {
        const { series, draft, versions, takedown } =
          await this.readChapterPublication(input);
        const lineage = await this.draftLineage(draft);
        const previousSnapshot = domainRule(() =>
          requirePublished(versions[0], series.id, draft.id),
        );
        const snapshot = domainRule(() =>
          revisePublishedChapter({
            series,
            previousSnapshot,
            fixedDraft: draft,
            actor,
            lineage,
            reason,
            ...(takedown ? { takedown } : {}),
            publishedAt: this.now(),
          }),
        );

        return this.publishSnapshot({
          actor,
          snapshot,
          action: "published-snapshot.revise",
        });
      },
    );
  }

  /**
   * Stops distributing a published Chapter, without deleting any of it.
   *
   * Repeating a takedown changes nothing, like repeating an approval: the record
   * names the Staff Account that took the decision, and a second attempt must
   * not move that to whoever came last.
   */
  async takeDownChapter(input: {
    principal: RequestPrincipal;
    seriesId: string;
    chapterId: string;
    reason: unknown;
  }): Promise<ChapterTakedown> {
    const reason = requiredReason(
      input.reason,
      "taking a Chapter down needs the reason distribution stopped",
    );

    return this.gate.run(
      input.principal,
      {
        action: "staff.published-chapter.takedown",
        target: staffAuditTarget("published-chapter", input.chapterId),
        permission: "chapter:takedown",
        reason,
      },
      async (actor) => {
        const { series, draft, versions } =
          await this.readChapterPublication(input);
        const snapshot = domainRule(() =>
          requirePublished(versions[0], series.id, draft.id),
        );

        const { outcome, takedown } = await this.publishingRepository.takeDown(
          domainRule(() =>
            takeDownPublishedChapter({
              snapshot,
              actor,
              reason,
              takenDownAt: this.now(),
            }),
          ),
        );

        // The repository keeps the decision that was already there, so a repeat
        // changes nothing — and a line of lineage for a change that did not
        // happen would name a moderator the record does not hold.
        if (outcome === "taken-down") {
          await this.provenanceRecorder.record({
            actor,
            action: "published-snapshot.takedown",
            subject: publishedSnapshotProvenance(snapshot),
          });
        }

        return takedown;
      },
    );
  }

  /**
   * Everything NovelX has published of one Chapter, and whether it is still
   * distributing it.
   *
   * This is where a revision or a takedown is answered for: every version is
   * here, newest first, each naming the Staff Account that published it, the
   * lineage it traced, and — from the second version on — the reason it replaced
   * the one before. Nothing is ever taken out of it.
   */
  async readPublicationRecord(input: {
    principal: RequestPrincipal;
    seriesId: string;
    chapterId: string;
  }): Promise<ChapterPublicationRecord> {
    return this.gate.run(
      input.principal,
      {
        action: "staff.published-chapter.read",
        target: staffAuditTarget("published-chapter", input.chapterId),
        permission: "series:read",
      },
      async () => {
        const { draft, versions, takedown } =
          await this.readChapterPublication(input);

        return {
          chapterId: draft.id,
          versions,
          ...(takedown ? { takedown } : {}),
        };
      },
    );
  }

  /**
   * A Chapter, the Series that holds it, and what NovelX has published of it.
   *
   * Revising, taking down, and inspecting all start from the same four facts,
   * and reading them in one place is what keeps a route from acting on the
   * record while answering from the distribution, or the other way round.
   */
  private async readChapterPublication(input: {
    seriesId: string;
    chapterId: string;
  }) {
    const { series, draft } = await requireSeriesChapter(
      this.staffCmsRepository,
      input,
    );
    const [versions, takedown] = await Promise.all([
      this.publishingRepository.listChapterVersions({
        seriesId: series.id,
        chapterId: draft.id,
      }),
      this.publishingRepository.findTakedown(draft.id),
    ]);

    return { series, draft, versions, takedown };
  }

  /**
   * Writes a version and appends the lineage for it.
   *
   * The domain refuses a Chapter the Series already shows, and the repository
   * refuses a version it already holds. Two operators publishing at once can
   * both pass the first and only one the second, so the write answers whether
   * it wrote rather than assuming it did.
   */
  private async publishSnapshot(input: {
    actor: StaffPrincipal;
    snapshot: PublishedSnapshot;
    action: "published-snapshot.publish" | "published-snapshot.revise";
  }): Promise<PublishedSnapshot> {
    const { snapshot } = input;

    if ((await this.publishingRepository.publish(snapshot)) !== "published") {
      throw new ConflictException(
        `version ${snapshot.version} of Chapter ${snapshot.chapterId} is already published`,
      );
    }

    await this.provenanceRecorder.record({
      actor: input.actor,
      action: input.action,
      subject: publishedSnapshotProvenance(snapshot),
    });

    return snapshot;
  }

  /** The lineage entry a snapshot's content traces, as the ledger holds it. */
  private draftLineage(draft: ChapterDraft) {
    return this.provenanceRepository.listForTarget({
      target: {
        kind: "chapter-draft",
        id: draft.id,
        seriesId: draft.seriesId,
      },
      limit: PUBLISHING_LINEAGE_LIMIT,
    });
  }
}

/**
 * The Chapter a revision or a takedown acts on has to be one readers were given
 * in the first place. Named as a publication refusal so it reads beside
 * "already published" rather than as a missing route.
 */
function requirePublished(
  snapshot: PublishedSnapshot | undefined,
  seriesId: string,
  chapterId: string,
): PublishedSnapshot {
  if (!snapshot) {
    throw new PublicationRefusedError(
      "chapter-not-published",
      `Chapter ${chapterId} of Series ${seriesId} has never been published`,
    );
  }

  return snapshot;
}

/**
 * The reason an operation is only accountable with. It is read before the gate
 * runs so it reaches the Staff Audit Record, which is where a revision and a
 * takedown are answered for after the fact.
 */
function requiredReason(reason: unknown, message: string): string {
  if (typeof reason !== "string" || !reason.trim()) {
    throw new BadRequestException(message);
  }

  return reason;
}
