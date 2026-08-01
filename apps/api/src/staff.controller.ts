import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Query,
} from "@nestjs/common";

import {
  STAFF_SESSION_HEADER,
  staffBoundaryPrincipal,
} from "./staff-principal.js";
import { StaffService } from "./staff.service.js";

type SignInBody = {
  staffAccountId?: unknown;
  credential?: unknown;
};

@Controller("staff")
export class StaffController {
  constructor(
    @Inject(StaffService) private readonly staffService: StaffService,
  ) {}

  @Post("sessions")
  signIn(
    @Body() body: SignInBody,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.staffService.signIn({
      staffAccountId: body?.staffAccountId,
      credential: body?.credential,
      presented: staffBoundaryPrincipal({ staffAuthorization, authorization }),
    });
  }

  @Get("session")
  currentSession(
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.staffService.currentSession({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
    });
  }

  @Get("audit-log")
  readAuditLog(
    @Query("limit") limit?: string,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.staffService.readAuditLog({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      ...(limit ? { limit: Number(limit) } : {}),
    });
  }
}
