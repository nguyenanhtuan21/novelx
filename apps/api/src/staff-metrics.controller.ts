import { Controller, Get, Headers, Inject } from "@nestjs/common";

import {
  STAFF_SESSION_HEADER,
  staffBoundaryPrincipal,
} from "./staff-principal.js";
import { StaffMetricsService } from "./staff-metrics.service.js";

/**
 * The metrics surface on the Staff Account boundary: where a product or staff
 * user inspects Weekly Engaged Reading Hours and its guardrails. Reading the
 * metric is privileged, so it reaches the staff boundary like every other
 * privileged read.
 */
@Controller("staff/metrics")
export class StaffMetricsController {
  constructor(
    @Inject(StaffMetricsService)
    private readonly metrics: StaffMetricsService,
  ) {}

  @Get("weekly-engaged-reading-hours")
  readWeeklyEngagedReadingHours(
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.metrics.readWeeklyEngagedReadingHours({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
    });
  }
}
