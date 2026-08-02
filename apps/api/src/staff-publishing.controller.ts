import {
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  Post,
  Put,
} from "@nestjs/common";

import {
  STAFF_SESSION_HEADER,
  staffBoundaryPrincipal,
} from "./staff-principal.js";
import { StaffPublishingService } from "./staff-publishing.service.js";

type ScheduleBody = {
  /** When the Chapter becomes public. */
  scheduledFor?: unknown;
};

/**
 * The publishing surface, on the Staff Account boundary. Approval, schedule,
 * and publication each hang off the draft Chapter they act on, within the
 * Series that holds it, because none of them is a thing in its own right: they
 * are what happens to a Chapter on its way to readers.
 */
@Controller("staff/series/:seriesId/chapters/:chapterId")
export class StaffPublishingController {
  constructor(
    @Inject(StaffPublishingService)
    private readonly publishing: StaffPublishingService,
  ) {}

  @Post("approval")
  approveChapter(
    @Param("seriesId") seriesId: string,
    @Param("chapterId") chapterId: string,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.publishing.approveChapter({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      seriesId,
      chapterId,
    });
  }

  @Put("schedule")
  scheduleChapter(
    @Param("seriesId") seriesId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: ScheduleBody,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.publishing.scheduleChapter({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      seriesId,
      chapterId,
      scheduledFor: body?.scheduledFor,
    });
  }

  @Post("publication")
  publishChapter(
    @Param("seriesId") seriesId: string,
    @Param("chapterId") chapterId: string,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.publishing.publishChapter({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      seriesId,
      chapterId,
    });
  }
}
