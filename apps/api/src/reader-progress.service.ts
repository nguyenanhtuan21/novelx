import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  createAnonymousReaderSession,
  createReaderAccount,
  getReadingProgressKey,
  recordAnonymousProgress,
  type ReadingProgress,
  upgradeAnonymousProgress,
} from "@novelx/shared";

import { CatalogService } from "./catalog.service.js";
import type { ReaderProgressRepository } from "./reader-progress.repository.js";

@Injectable()
export class ReaderProgressService {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly readerProgressRepository: ReaderProgressRepository,
  ) {}

  async recordAnonymousProgress(input: {
    sessionId: string;
    seriesId: string;
    chapterId: string;
    position: number;
    updatedAt?: string;
  }) {
    await this.assertProgressCanBeSaved(input);

    const session =
      (await this.readerProgressRepository.getAnonymousSession(
        input.sessionId,
      )) ?? createAnonymousReaderSession({ id: input.sessionId });
    const updatedSession = recordAnonymousProgress(
      session,
      createReadingProgress(input),
    );

    return this.readerProgressRepository.saveAnonymousSession(updatedSession);
  }

  async upgradeAnonymousSession(input: {
    sessionId: string;
    readerAccountId: string;
  }) {
    const session = await this.readerProgressRepository.getAnonymousSession(
      input.sessionId,
    );

    if (!session) {
      throw new NotFoundException("Anonymous Reader Session not found");
    }

    const reader =
      (await this.readerProgressRepository.getReaderAccount(
        input.readerAccountId,
      )) ?? createReaderAccount({ id: input.readerAccountId });
    const upgradedReader = upgradeAnonymousProgress({ session, reader });
    const savedReader =
      await this.readerProgressRepository.saveReaderAccount(upgradedReader);

    return { id: savedReader.id, progress: savedReader.progress };
  }

  async recordReaderProgress(input: {
    readerAccountId: string;
    seriesId: string;
    chapterId: string;
    position: number;
    updatedAt?: string;
  }) {
    await this.assertProgressCanBeSaved(input);

    const reader = await this.readerProgressRepository.getReaderAccount(
      input.readerAccountId,
    );

    if (!reader) {
      throw new NotFoundException("Reader Account not found");
    }

    const savedReader = await this.readerProgressRepository.saveReaderAccount({
      ...reader,
      progress: {
        ...reader.progress,
        [getReadingProgressKey(input)]: createReadingProgress(input),
      },
    });

    return { id: savedReader.id, progress: savedReader.progress };
  }

  private async assertProgressCanBeSaved(input: {
    seriesId: string;
    chapterId: string;
    position: number;
  }) {
    if (!Number.isFinite(input.position) || input.position < 0) {
      throw new BadRequestException("progress position must be non-negative");
    }

    await this.catalogService.getPublicChapter({
      seriesId: input.seriesId,
      chapterId: input.chapterId,
    });
  }
}

function createReadingProgress(input: {
  seriesId: string;
  chapterId: string;
  position: number;
  updatedAt?: string;
}): ReadingProgress {
  return {
    seriesId: input.seriesId,
    chapterId: input.chapterId,
    position: input.position,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}
