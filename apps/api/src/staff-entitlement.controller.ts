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
import { StaffEntitlementService } from "./staff-entitlement.service.js";

type BenefitBody = {
  benefit?: unknown;
};

type GrantBody = {
  contentId?: unknown;
  benefit?: unknown;
};

/**
 * The Entitlement surface on the Staff Account boundary. Marking a Chapter as
 * demanding a benefit, and granting a reader the entitlement that satisfies it,
 * are the two operations that stand in for payment-provider integration until
 * one exists (ADR-0020).
 */
@Controller("staff")
export class StaffEntitlementController {
  constructor(
    @Inject(StaffEntitlementService)
    private readonly entitlement: StaffEntitlementService,
  ) {}

  @Put("series/:seriesId/chapters/:chapterId/entitlement")
  markRequirement(
    @Param("seriesId") seriesId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: BenefitBody,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.entitlement.markRequirement({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      seriesId,
      chapterId,
      benefit: body?.benefit,
    });
  }

  @Post("reader-accounts/:readerAccountId/entitlements")
  grantEntitlement(
    @Param("readerAccountId") readerAccountId: string,
    @Body() body: GrantBody,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.entitlement.grantEntitlement({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      readerAccountId,
      contentId: body?.contentId,
      benefit: body?.benefit,
    });
  }
}
