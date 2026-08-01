import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
} from "@nestjs/common";

import {
  STAFF_SESSION_HEADER,
  staffBoundaryPrincipal,
} from "./staff-principal.js";
import { StaffQualityGateService } from "./staff-quality-gate.service.js";

type QualityGateRunBody = {
  /** What the checkers found, for the conditions only a checker can answer. */
  reportedChecks?: unknown;
};

/**
 * The Quality Gate surface, on the Staff Account boundary. A gate result belongs
 * to the draft Chapter it evaluated, so it is run and read under that Chapter
 * within the Series that holds it.
 */
@Controller("staff/series/:seriesId/chapters/:chapterId/quality-gate")
export class StaffQualityGateController {
  constructor(
    @Inject(StaffQualityGateService)
    private readonly qualityGate: StaffQualityGateService,
  ) {}

  @Post()
  runQualityGate(
    @Param("seriesId") seriesId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: QualityGateRunBody,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.qualityGate.runQualityGate({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      seriesId,
      chapterId,
      reportedChecks: body?.reportedChecks,
    });
  }

  @Get()
  readQualityGate(
    @Param("seriesId") seriesId: string,
    @Param("chapterId") chapterId: string,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.qualityGate.readQualityGate({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      seriesId,
      chapterId,
    });
  }
}
