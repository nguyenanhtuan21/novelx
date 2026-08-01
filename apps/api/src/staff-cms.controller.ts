import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import type {
  CanonEntry,
  CreativeDisclosure,
  ManagedTaxonomy,
  Series,
} from "@novelx/shared";

import { StaffCmsService } from "./staff-cms.service.js";
import {
  STAFF_SESSION_HEADER,
  staffBoundaryPrincipal,
} from "./staff-principal.js";

type SeriesBody = {
  id: string;
  title: string;
  synopsis: string;
  creativeDisclosure: CreativeDisclosure;
  taxonomy: ManagedTaxonomy;
  status?: Series["status"];
};

type StoryBibleBody = {
  canon: CanonEntry[];
  reason?: string;
};

type ChapterDraftBody = {
  id: string;
  chapterNumber: number;
  title: string;
  body: string;
  creativeDisclosure?: CreativeDisclosure;
};

/**
 * The staff CMS surface, on the Staff Account boundary. It resolves who the
 * request presented and hands every decision to StaffCmsService; a reader
 * session is resolved only so that a refused attempt is audited as the reader
 * session it came from.
 */
@Controller("staff/series")
export class StaffCmsController {
  constructor(
    @Inject(StaffCmsService) private readonly staffCms: StaffCmsService,
  ) {}

  @Post()
  createSeries(
    @Body() body: SeriesBody,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.staffCms.createSeries({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      series: body,
    });
  }

  @Get(":seriesId")
  readSeries(
    @Param("seriesId") seriesId: string,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.staffCms.readSeries({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      seriesId,
    });
  }

  @Put(":seriesId")
  updateSeries(
    @Param("seriesId") seriesId: string,
    @Body() body: Partial<Omit<SeriesBody, "id">>,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.staffCms.updateSeries({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      seriesId,
      changes: body,
    });
  }

  @Put(":seriesId/story-bible")
  amendStoryBible(
    @Param("seriesId") seriesId: string,
    @Body() body: StoryBibleBody,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.staffCms.amendStoryBible({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      seriesId,
      canon: body?.canon,
      ...(body?.reason === undefined ? {} : { reason: body.reason }),
    });
  }

  @Post(":seriesId/story-bible/lock")
  lockStoryBible(
    @Param("seriesId") seriesId: string,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.staffCms.lockStoryBible({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      seriesId,
    });
  }

  @Post(":seriesId/chapters")
  authorChapterDraft(
    @Param("seriesId") seriesId: string,
    @Body() body: ChapterDraftBody,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.staffCms.authorChapterDraft({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      seriesId,
      draft: body,
    });
  }
}
