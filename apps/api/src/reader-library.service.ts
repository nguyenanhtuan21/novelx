import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  acceptReadingEngagement,
  assertReaderAccountPrincipal,
  buildReaderLibrary,
  createAnonymousReaderPrincipal,
  createReaderAccount,
  createReaderPrincipal,
  READER_ACCOUNT_UPGRADE_REQUIRED,
  ReaderAccountUpgradeRequiredError,
  ReadingEngagementRefusedError,
  upgradeAnonymousProgress,
  type AnonymousReaderPrincipal,
  type ReaderLibrary,
  type ReaderPrincipal,
  type ReaderRequestPrincipal,
  type ReadingEngagement,
  type ReadingProgress,
} from "@novelx/shared";

import type { CatalogService } from "./catalog.service.js";
import type { ReadingEngagementRepository } from "./reading-engagement.repository.js";
import type { ReaderLibraryRepository } from "./reader-library.repository.js";
import { readerSessionSecret } from "./reader-principal.js";
import { signReaderSessionToken } from "./reader-session-token.js";

/** Where a reader-facing client should send an Anonymous Reader Session to upgrade. */
export const READER_ACCOUNT_UPGRADE_PATH = "/reader/accounts";

export type ReaderLibraryServiceOptions = {
  now?: () => string;
  newReaderAccountId?: () => string;
  newAnonymousSessionId?: () => string;
  issueToken?: (principal: ReaderRequestPrincipal, issuedAt: string) => string;
};

@Injectable()
export class ReaderLibraryService {
  private readonly now: () => string;
  private readonly newReaderAccountId: () => string;
  private readonly newAnonymousSessionId: () => string;
  private readonly issueToken: (
    principal: ReaderRequestPrincipal,
    issuedAt: string,
  ) => string;

  constructor(
    private readonly readerLibraryRepository: ReaderLibraryRepository,
    private readonly catalogService: CatalogService,
    private readonly readingEngagementRepository: ReadingEngagementRepository,
    options: ReaderLibraryServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.newReaderAccountId =
      options.newReaderAccountId ?? (() => randomUUID());
    this.newAnonymousSessionId =
      options.newAnonymousSessionId ?? (() => randomUUID());
    this.issueToken =
      options.issueToken ??
      ((principal, issuedAt) =>
        signReaderSessionToken({
          principal,
          secret: readerSessionSecret(),
          issuedAt,
        }));
  }

  async followSeries(input: {
    principal: ReaderRequestPrincipal;
    seriesId: string;
  }): Promise<ReaderLibrary> {
    const principal = this.requireReaderAccount(input.principal);
    const series = await this.catalogService.getPublicSeries({
      seriesId: input.seriesId,
    });

    await this.readerLibraryRepository.followSeries({
      readerAccountId: principal.readerAccountId,
      follow: { seriesId: series.id, followedAt: this.now() },
    });

    return this.getLibrary({ principal });
  }

  async unfollowSeries(input: {
    principal: ReaderRequestPrincipal;
    seriesId: string;
  }): Promise<ReaderLibrary> {
    const principal = this.requireReaderAccount(input.principal);

    await this.readerLibraryRepository.unfollowSeries({
      readerAccountId: principal.readerAccountId,
      seriesId: input.seriesId,
    });

    return this.getLibrary({ principal });
  }

  async recordProgress(input: {
    principal: ReaderRequestPrincipal;
    seriesId: string;
    chapterId: string;
    position: number;
  }): Promise<ReadingProgress> {
    if (!Number.isFinite(input.position) || input.position < 0) {
      throw new BadRequestException("progress position must be non-negative");
    }

    // Progress only means something against a Chapter the reader may read.
    await this.catalogService.getPublicChapter({
      seriesId: input.seriesId,
      chapterId: input.chapterId,
    });

    const progress: ReadingProgress = {
      seriesId: input.seriesId,
      chapterId: input.chapterId,
      position: input.position,
      updatedAt: this.now(),
    };

    if (input.principal.kind === "anonymous-reader") {
      await this.readerLibraryRepository.recordAnonymousProgress({
        anonymousSessionId: this.requireAnonymousSessionId(input.principal),
        progress,
      });

      return progress;
    }

    await this.readerLibraryRepository.recordReaderProgress({
      readerAccountId: input.principal.readerAccountId,
      progress,
    });

    return progress;
  }

  /**
   * Records a chunk of engaged reading time a reader spent on a Chapter, which
   * is what Weekly Engaged Reading Hours is built from (CONTEXT: Weekly Engaged
   * Reading Hours).
   *
   * The event is a debounced chunk rather than per-scroll, so the metric
   * measures reading rather than how often the page fired. The domain keeps the
   * obvious noise out, and the boundary resolves which reader reported it and
   * checks the Chapter is public — the same two facts progress is read against.
   */
  async recordEngagement(input: {
    principal: ReaderRequestPrincipal;
    seriesId: string;
    chapterId: string;
    engagedSeconds: number;
    position: number;
  }): Promise<ReadingEngagement> {
    await this.catalogService.getPublicChapter({
      seriesId: input.seriesId,
      chapterId: input.chapterId,
    });

    const occurredAt = this.now();

    try {
      const engagement = acceptReadingEngagement({
        ...this.engagementReader(input.principal),
        seriesId: input.seriesId,
        chapterId: input.chapterId,
        engagedSeconds: input.engagedSeconds,
        position: input.position,
        occurredAt,
      });

      await this.readingEngagementRepository.record(engagement);

      return engagement;
    } catch (error) {
      if (error instanceof ReadingEngagementRefusedError) {
        throw new BadRequestException({
          error: error.code,
          message: error.message,
        });
      }

      throw error;
    }
  }

  /**
   * The reader an engagement is attributed to, or nothing when the request named
   * no reader at all. An unidentified session is exactly the noise the boundary
   * keeps out: an engagement nobody reported does not reach the north-star.
   */
  private engagementReader(principal: ReaderRequestPrincipal): {
    readerAccountId?: string;
    anonymousSessionId?: string;
  } {
    if (principal.kind === "reader") {
      return { readerAccountId: principal.readerAccountId };
    }

    return { anonymousSessionId: this.requireAnonymousSessionId(principal) };
  }

  /** Starts an Anonymous Reader Session for a reader who holds no token yet. */
  async startAnonymousSession(): Promise<{
    anonymousSessionId: string;
    token: string;
  }> {
    const principal = createAnonymousReaderPrincipal({
      anonymousSessionId: this.newAnonymousSessionId(),
    });

    return {
      anonymousSessionId: principal.anonymousSessionId,
      token: this.issueToken(principal, this.now()),
    };
  }

  /**
   * Upgrades an Anonymous Reader Session into a Reader Account, carrying the
   * session's lightweight progress across so the reader keeps their place, and
   * issues the token that names the Reader Account from now on.
   */
  async upgradeAnonymousSession(input: {
    principal: ReaderRequestPrincipal;
  }): Promise<{ readerAccountId: string; token: string }> {
    if (input.principal.kind === "reader") {
      return this.readerSession(input.principal.readerAccountId);
    }

    const anonymousSessionId = this.requireAnonymousSessionId(input.principal);
    const session =
      await this.readerLibraryRepository.loadAnonymousSession(
        anonymousSessionId,
      );
    const upgraded = await this.readerLibraryRepository.upgradeAnonymousSession(
      {
        anonymousSessionId,
        reader: upgradeAnonymousProgress({
          session,
          reader: createReaderAccount({ id: this.newReaderAccountId() }),
        }),
      },
    );

    return this.readerSession(upgraded.readerAccountId);
  }

  private readerSession(readerAccountId: string): {
    readerAccountId: string;
    token: string;
  } {
    return {
      readerAccountId,
      token: this.issueToken(
        createReaderPrincipal({ readerAccountId }),
        this.now(),
      ),
    };
  }

  async getLibrary(input: {
    principal: ReaderRequestPrincipal;
  }): Promise<ReaderLibrary> {
    const principal = this.requireReaderAccount(input.principal);
    const [reader, catalog] = await Promise.all([
      this.readerLibraryRepository.loadReaderAccount(principal.readerAccountId),
      this.catalogService.listSeries(),
    ]);

    return buildReaderLibrary({ reader, catalog });
  }

  /**
   * Session state must never be shared between unidentified readers, so an
   * Anonymous Reader Session has to name itself before anything is stored.
   */
  private requireAnonymousSessionId(
    principal: AnonymousReaderPrincipal,
  ): string {
    if (!principal.anonymousSessionId) {
      throw new BadRequestException(
        "Anonymous Reader Session id is required before storing reader state",
      );
    }

    return principal.anonymousSessionId;
  }

  private requireReaderAccount(
    principal: ReaderRequestPrincipal,
  ): ReaderPrincipal {
    try {
      assertReaderAccountPrincipal(principal);
    } catch (error) {
      if (error instanceof ReaderAccountUpgradeRequiredError) {
        throw new UnauthorizedException({
          error: READER_ACCOUNT_UPGRADE_REQUIRED,
          message: error.message,
          upgradePath: READER_ACCOUNT_UPGRADE_PATH,
        });
      }

      throw error;
    }

    return principal;
  }
}
