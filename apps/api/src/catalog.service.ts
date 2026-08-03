import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  decideChapterAccess,
  ENTITLEMENT_REQUIRED,
  publicCatalogSeries,
  publicChapter,
  type Entitlement,
  type EntitlementRequirement,
  type PublicCatalogSeries,
  type PublicChapter,
  type ReaderRequestPrincipal,
} from "@novelx/shared";

import type { CatalogRepository } from "./catalog.repository.js";
import type { EntitlementRequirementRepository } from "./entitlement-requirement.repository.js";
import type { ReaderLibraryRepository } from "./reader-library.repository.js";
import { READER_ACCOUNT_UPGRADE_PATH } from "./reader-library.service.js";

@Injectable()
export class CatalogService {
  constructor(
    private readonly catalogRepository: CatalogRepository,
    private readonly entitlementRequirementRepository: EntitlementRequirementRepository,
    private readonly readerLibraryRepository: ReaderLibraryRepository,
  ) {}

  async listSeries(): Promise<PublicCatalogSeries[]> {
    const seriesList = await this.catalogRepository.listSeries();

    return seriesList
      .filter((series) => series.firstPublicChapterId)
      .map((series) => publicCatalogSeries(series));
  }

  async getPublicSeries(input: { seriesId: string }) {
    const series = (await this.listSeries()).find(
      (candidate) => candidate.id === input.seriesId,
    );

    if (!series) {
      throw new NotFoundException("Public Series not found");
    }

    return series;
  }

  /**
   * A public Chapter read, which is a reader-facing projection rather than the
   * snapshot itself: how a Chapter was cleared, traced, and published is how
   * NovelX answers for it internally, and this route is unauthenticated.
   */
  async getPublicChapter(input: {
    seriesId: string;
    chapterId: string;
  }): Promise<PublicChapter> {
    const snapshot = await this.catalogRepository.getPublicChapter(input);

    if (!snapshot) {
      throw new NotFoundException("Published Snapshot not found");
    }

    return publicChapter(snapshot);
  }

  /**
   * A reader's read of a Chapter, gated by Entitlement state rather than
   * payment-provider state (ADR-0020).
   *
   * A Chapter with no requirement is open to every reader, anonymous included.
   * One that demands a benefit is granted only to a reader who holds the
   * entitlement for it; a reader who does not — or an anonymous session that
   * cannot — gets a clear, upgrade-ready refusal rather than the prose.
   */
  async readPublicChapter(input: {
    seriesId: string;
    chapterId: string;
    principal: ReaderRequestPrincipal;
  }): Promise<PublicChapter> {
    const chapter = await this.getPublicChapter(input);

    const requirement =
      await this.entitlementRequirementRepository.findRequirement(
        input.chapterId,
      );

    if (!requirement) {
      return chapter;
    }

    const entitlements = await this.readerEntitlements(input.principal);
    const decision = decideChapterAccess({ requirement, entitlements });

    if (decision.granted) {
      return chapter;
    }

    throw chapterAccessRefusal(decision.requirement);
  }

  private async readerEntitlements(
    principal: ReaderRequestPrincipal,
  ): Promise<Record<string, Entitlement>> {
    return principal.kind === "reader"
      ? this.readerLibraryRepository.loadEntitlements(principal.readerAccountId)
      : {};
  }
}

/**
 * The 402 a reader without the Entitlement a Chapter demands gets. It carries
 * the benefit and the content so a client renders an upgrade-ready state from
 * the refusal alone.
 */
function chapterAccessRefusal(
  requirement: EntitlementRequirement,
): HttpException {
  return new HttpException(
    {
      error: ENTITLEMENT_REQUIRED,
      message: `this Chapter requires the ${requirement.benefit} Entitlement`,
      benefit: requirement.benefit,
      contentId: requirement.chapterId,
      upgradePath: READER_ACCOUNT_UPGRADE_PATH,
    },
    HttpStatus.PAYMENT_REQUIRED,
  );
}
