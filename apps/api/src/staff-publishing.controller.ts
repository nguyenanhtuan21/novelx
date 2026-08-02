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

import {
  STAFF_SESSION_HEADER,
  staffBoundaryPrincipal,
} from "./staff-principal.js";
import { StaffPublishingService } from "./staff-publishing.service.js";

type ScheduleBody = {
  /** When the Chapter becomes public. */
  scheduledFor?: unknown;
};

/** What an operation is only accountable with: why the operator did it. */
type AccountableBody = {
  reason?: unknown;
};

/**
 * The publishing surface, on the Staff Account boundary. Approval, schedule,
 * publication, revision, and takedown each hang off the Chapter they act on,
 * within the Series that holds it, because none of them is a thing in its own
 * right: they are what happens to a Chapter on its way to readers, and on its
 * way back.
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

  @Get("publication")
  readPublicationRecord(
    @Param("seriesId") seriesId: string,
    @Param("chapterId") chapterId: string,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.publishing.readPublicationRecord({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      seriesId,
      chapterId,
    });
  }

  @Post("revision")
  reviseChapter(
    @Param("seriesId") seriesId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: AccountableBody,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.publishing.reviseChapter({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      seriesId,
      chapterId,
      reason: body?.reason,
    });
  }

  @Post("takedown")
  takeDownChapter(
    @Param("seriesId") seriesId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: AccountableBody,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.publishing.takeDownChapter({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      seriesId,
      chapterId,
      reason: body?.reason,
    });
  }
}
