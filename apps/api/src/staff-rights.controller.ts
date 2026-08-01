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
import {
  StaffRightsService,
  type RightsRecordRequest,
} from "./staff-rights.service.js";

/**
 * The Rights Record surface, on the Staff Account boundary. Recording rights is
 * staff work with consequences for every workflow that later relies on it, so
 * it lives here rather than anywhere a workflow could reach.
 */
@Controller("staff/rights-records")
export class StaffRightsController {
  constructor(
    @Inject(StaffRightsService)
    private readonly staffRights: StaffRightsService,
  ) {}

  @Post()
  recordRights(
    @Body() body: RightsRecordRequest,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.staffRights.recordRights({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      rightsRecord: body,
    });
  }

  @Get(":rightsRecordId")
  readRightsRecord(
    @Param("rightsRecordId") rightsRecordId: string,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.staffRights.readRightsRecord({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      rightsRecordId,
    });
  }
}
