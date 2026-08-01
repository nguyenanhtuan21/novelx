import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Query,
} from "@nestjs/common";
import type { RequestPrincipal } from "@novelx/shared";

import {
  namedReaderPrincipal,
  readerSessionSecret,
} from "./reader-principal.js";
import {
  STAFF_SESSION_HEADER,
  staffRequestPrincipal,
  staffSessionSecret,
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
      presented: this.principal(staffAuthorization, authorization),
    });
  }

  @Get("session")
  currentSession(
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.staffService.currentSession({
      principal: this.principal(staffAuthorization, authorization),
    });
  }

  @Get("audit-log")
  readAuditLog(
    @Query("limit") limit?: string,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.staffService.readAuditLog({
      principal: this.principal(staffAuthorization, authorization),
      ...(limit ? { limit: Number(limit) } : {}),
    });
  }

  /**
   * Names whoever the request presented. Only the staff header can produce a
   * Staff Account; a reader session token is resolved solely so that a refused
   * attempt is audited as the reader session it came from.
   */
  private principal(
    staffAuthorization: string | undefined,
    authorization: string | undefined,
  ): RequestPrincipal {
    return (
      staffRequestPrincipal({
        staffAuthorization,
        secret: staffSessionSecret(),
        now: new Date().toISOString(),
      }) ??
      namedReaderPrincipal({
        authorization,
        secret: readerSessionSecret(),
      })
    );
  }
}
