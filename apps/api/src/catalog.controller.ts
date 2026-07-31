import { Controller, Get, Inject, Param } from "@nestjs/common";

import { CatalogService } from "./catalog.service.js";

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
  getPublicChapter(
    @Param("seriesId") seriesId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return this.catalogService.getPublicChapter({ seriesId, chapterId });
  }
}
