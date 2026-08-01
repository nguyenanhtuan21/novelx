import { Controller, Get, Headers, Inject, Param, Query } from "@nestjs/common";

import {
  STAFF_SESSION_HEADER,
  staffBoundaryPrincipal,
} from "./staff-principal.js";
import { StaffProvenanceService } from "./staff-provenance.service.js";

/**
 * The Provenance Ledger surface, on the Staff Account boundary. Lineage is read
 * under the Series that holds it, so one Series' history reads whole and one
 * artifact's history reads on its own.
 */
@Controller("staff/series/:seriesId/provenance")
export class StaffProvenanceController {
  constructor(
    @Inject(StaffProvenanceService)
    private readonly staffProvenance: StaffProvenanceService,
  ) {}

  @Get()
  readSeriesProvenance(
    @Param("seriesId") seriesId: string,
    @Query("limit") limit?: string,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.staffProvenance.readSeriesProvenance({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      seriesId,
      ...(limit ? { limit: Number(limit) } : {}),
    });
  }

  @Get(":targetKind/:targetId")
  readTargetProvenance(
    @Param("seriesId") seriesId: string,
    @Param("targetKind") targetKind: string,
    @Param("targetId") targetId: string,
    @Query("limit") limit?: string,
    @Headers(STAFF_SESSION_HEADER) staffAuthorization?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.staffProvenance.readTargetProvenance({
      principal: staffBoundaryPrincipal({ staffAuthorization, authorization }),
      seriesId,
      targetKind,
      targetId,
      ...(limit ? { limit: Number(limit) } : {}),
    });
  }
}
