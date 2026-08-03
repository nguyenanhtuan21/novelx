import { Controller, Get, Headers, Inject, Param } from "@nestjs/common";

import { CatalogService } from "./catalog.service.js";
import {
  readerRequestPrincipal,
  readerSessionSecret,
} from "./reader-principal.js";

@Controller("catalog")
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalogService: CatalogService,
  ) {}

  @Get("series")
  listSeries() {
    return this.catalogService.listSeries();
  }

  @Get("series/:seriesId")
  getPublicSeries(@Param("seriesId") seriesId: string) {
    return this.catalogService.getPublicSeries({ seriesId });
  }

  @Get("series/:seriesId/chapters/:chapterId")
  readPublicChapter(
    @Param("seriesId") seriesId: string,
    @Param("chapterId") chapterId: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.catalogService.readPublicChapter({
      seriesId,
      chapterId,
      principal: readerRequestPrincipal({
        authorization,
        secret: readerSessionSecret(),
      }),
    });
  }
}
