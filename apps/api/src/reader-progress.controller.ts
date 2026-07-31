import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Param,
  Post,
} from "@nestjs/common";

import { ReaderProgressService } from "./reader-progress.service.js";

type ProgressRequest = {
  seriesId?: unknown;
  chapterId?: unknown;
  position?: unknown;
  updatedAt?: unknown;
};

type UpgradeProgressRequest = {
  sessionId?: unknown;
};

@Controller("reader-sessions")
export class ReaderProgressController {
  constructor(
    @Inject(ReaderProgressService)
    private readonly readerProgressService: ReaderProgressService,
  ) {}

  @Post(":sessionId/progress")
  recordAnonymousProgress(
    @Param("sessionId") sessionId: string,
    @Body() body: ProgressRequest,
  ) {
    return this.readerProgressService.recordAnonymousProgress({
      sessionId,
      ...parseProgressRequest(body),
    });
  }
}

@Controller("reader-accounts")
export class ReaderAccountProgressController {
  constructor(
    @Inject(ReaderProgressService)
    private readonly readerProgressService: ReaderProgressService,
  ) {}

  @Post(":readerAccountId/progress")
  recordReaderProgress(
    @Param("readerAccountId") readerAccountId: string,
    @Body() body: ProgressRequest,
  ) {
    return this.readerProgressService.recordReaderProgress({
      readerAccountId,
      ...parseProgressRequest(body),
    });
  }

  @Post(":readerAccountId/anonymous-session-upgrade")
  upgradeAnonymousSession(
    @Param("readerAccountId") readerAccountId: string,
    @Body() body: UpgradeProgressRequest,
  ) {
    return this.readerProgressService.upgradeAnonymousSession({
      readerAccountId,
      sessionId: requireString(body.sessionId, "sessionId"),
    });
  }
}

function parseProgressRequest(body: ProgressRequest) {
  return {
    seriesId: requireString(body.seriesId, "seriesId"),
    chapterId: requireString(body.chapterId, "chapterId"),
    position: requireNumber(body.position, "position"),
    updatedAt: optionalString(body.updatedAt, "updatedAt"),
  };
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException(`${fieldName} is required`);
  }

  return value;
}

function optionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException(`${fieldName} must be a string`);
  }

  return value;
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number") {
    throw new BadRequestException(`${fieldName} is required`);
  }

  return value;
}
