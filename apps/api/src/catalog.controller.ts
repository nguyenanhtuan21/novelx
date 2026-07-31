import { Controller, Get, Param } from "@nestjs/common";

import { CatalogService } from "./catalog.service.js";

@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("series")
  listSeries() {
    return this.catalogService.listSeries();
  }

  @Get("series/:id/chapters/:chapterId")
  getPublicChapter(@Param("id") seriesId: string, @Param("chapterId") chapterId: string) {
    return this.catalogService.getPublicChapter({ seriesId, chapterId });
  }
}
