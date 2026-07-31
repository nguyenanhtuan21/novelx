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
import { readerRequestPrincipal } from "./reader-principal.js";

type RequestHeaders = Record<string, string | string[] | undefined>;

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
  getLibrary(@Headers() headers: RequestHeaders) {
    return this.readerLibraryService.getLibrary({
      principal: readerRequestPrincipal(headers),
    });
  }

  @Put("library/follows/:seriesId")
  followSeries(
    @Headers() headers: RequestHeaders,
    @Param("seriesId") seriesId: string,
  ) {
    return this.readerLibraryService.followSeries({
      principal: readerRequestPrincipal(headers),
      seriesId,
    });
  }

  @Delete("library/follows/:seriesId")
  unfollowSeries(
    @Headers() headers: RequestHeaders,
    @Param("seriesId") seriesId: string,
  ) {
    return this.readerLibraryService.unfollowSeries({
      principal: readerRequestPrincipal(headers),
      seriesId,
    });
  }

  @Put("progress")
  recordProgress(
    @Headers() headers: RequestHeaders,
    @Body() body: RecordProgressBody,
  ) {
    return this.readerLibraryService.recordProgress({
      principal: readerRequestPrincipal(headers),
      seriesId: body?.seriesId,
      chapterId: body?.chapterId,
      position: body?.position,
    });
  }

  @Post("accounts")
  upgradeAnonymousSession(@Headers() headers: RequestHeaders) {
    return this.readerLibraryService.upgradeAnonymousSession({
      principal: readerRequestPrincipal(headers),
    });
  }
}
