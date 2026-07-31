import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
} from "@nestjs/common";

import { ReaderLibraryService } from "./reader-library.service.js";
import {
  readerRequestPrincipal,
  readerSessionSecret,
} from "./reader-principal.js";

type RecordProgressBody = {
  seriesId: string;
  chapterId: string;
  position: number;
};

@Controller("reader")
export class ReaderLibraryController {
  constructor(
    @Inject(ReaderLibraryService)
    private readonly readerLibraryService: ReaderLibraryService,
  ) {}

  @Get("library")
  getLibrary(@Headers("authorization") authorization?: string) {
    return this.readerLibraryService.getLibrary({
      principal: this.principal(authorization),
    });
  }

  @Put("library/follows/:seriesId")
  followSeries(
    @Param("seriesId") seriesId: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.readerLibraryService.followSeries({
      principal: this.principal(authorization),
      seriesId,
    });
  }

  @Delete("library/follows/:seriesId")
  unfollowSeries(
    @Param("seriesId") seriesId: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.readerLibraryService.unfollowSeries({
      principal: this.principal(authorization),
      seriesId,
    });
  }

  @Put("progress")
  recordProgress(
    @Body() body: RecordProgressBody,
    @Headers("authorization") authorization?: string,
  ) {
    return this.readerLibraryService.recordProgress({
      principal: this.principal(authorization),
      seriesId: body?.seriesId,
      chapterId: body?.chapterId,
      position: body?.position,
    });
  }

  /** Starts an Anonymous Reader Session for a reader who has no token yet. */
  @Post("sessions")
  startAnonymousSession() {
    return this.readerLibraryService.startAnonymousSession();
  }

  @Post("accounts")
  upgradeAnonymousSession(@Headers("authorization") authorization?: string) {
    return this.readerLibraryService.upgradeAnonymousSession({
      principal: this.principal(authorization),
    });
  }

  private principal(authorization: string | undefined) {
    return readerRequestPrincipal({
      authorization,
      secret: readerSessionSecret(),
    });
  }
}
