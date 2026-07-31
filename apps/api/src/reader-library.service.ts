import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  assertReaderAccountPrincipal,
  buildReaderLibrary,
  createReaderAccount,
  READER_ACCOUNT_UPGRADE_REQUIRED,
  ReaderAccountUpgradeRequiredError,
  upgradeAnonymousProgress,
  type AnonymousReaderPrincipal,
  type ReaderLibrary,
  type ReaderPrincipal,
  type ReaderRequestPrincipal,
  type ReadingProgress,
} from "@novelx/shared";

import type { CatalogService } from "./catalog.service.js";
import type { ReaderLibraryRepository } from "./reader-library.repository.js";

/** Where a reader-facing client should send an Anonymous Reader Session to upgrade. */
export const READER_ACCOUNT_UPGRADE_PATH = "/reader/accounts";

export type ReaderLibraryServiceOptions = {
  now?: () => string;
  newReaderAccountId?: () => string;
};

@Injectable()
export class ReaderLibraryService {
  private readonly now: () => string;
  private readonly newReaderAccountId: () => string;

  constructor(
    private readonly readerLibraryRepository: ReaderLibraryRepository,
    private readonly catalogService: CatalogService,
    options: ReaderLibraryServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.newReaderAccountId =
      options.newReaderAccountId ?? (() => randomUUID());
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
   * Upgrades an Anonymous Reader Session into a Reader Account, carrying the
   * session's lightweight progress across so the reader keeps their place.
   */
  async upgradeAnonymousSession(input: {
    principal: ReaderRequestPrincipal;
  }): Promise<{ readerAccountId: string }> {
    if (input.principal.kind === "reader") {
      return { readerAccountId: input.principal.readerAccountId };
    }

    const anonymousSessionId = this.requireAnonymousSessionId(input.principal);
    const session =
      await this.readerLibraryRepository.loadAnonymousSession(
        anonymousSessionId,
      );

    return this.readerLibraryRepository.upgradeAnonymousSession({
      anonymousSessionId,
      reader: upgradeAnonymousProgress({
        session,
        reader: createReaderAccount({ id: this.newReaderAccountId() }),
      }),
    });
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
