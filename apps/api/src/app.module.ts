import { Module } from "@nestjs/common";

import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from "./catalog.repository.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";
import {
  ENTITLEMENT_REQUIREMENT_REPOSITORY,
  type EntitlementRequirementRepository,
} from "./entitlement-requirement.repository.js";
import { BaselineGuardrailSignalsSource } from "./baseline-guardrail-signals-source.js";
import {
  GUARDRAIL_SIGNALS_SOURCE,
  type GuardrailSignalsSource,
} from "./guardrail-signals-source.js";
import { HealthController } from "./health.controller.js";
import { InMemoryEntitlementRequirementRepository } from "./in-memory-entitlement-requirement.repository.js";
import { InMemoryProvenanceRepository } from "./in-memory-provenance.repository.js";
import { InMemoryPublishingRepository } from "./in-memory-publishing.repository.js";
import { InMemoryReadingEngagementRepository } from "./in-memory-reading-engagement.repository.js";
import { InMemoryReaderLibraryRepository } from "./in-memory-reader-library.repository.js";
import { InMemoryRightsRepository } from "./in-memory-rights.repository.js";
import { InMemoryStaffAuditRepository } from "./in-memory-staff-audit.repository.js";
import { InMemoryStaffCmsRepository } from "./in-memory-staff-cms.repository.js";
import { PostgresCatalogRepository } from "./postgres-catalog.repository.js";
import { PostgresEntitlementRequirementRepository } from "./postgres-entitlement-requirement.repository.js";
import { PostgresProvenanceRepository } from "./postgres-provenance.repository.js";
import { PostgresPublishingRepository } from "./postgres-publishing.repository.js";
import { PostgresReaderLibraryRepository } from "./postgres-reader-library.repository.js";
import { PostgresRightsRepository } from "./postgres-rights.repository.js";
import { PostgresStaffAuditRepository } from "./postgres-staff-audit.repository.js";
import {
  READING_ENGAGEMENT_REPOSITORY,
  type ReadingEngagementRepository,
} from "./reading-engagement.repository.js";
import { ProvenanceRecorder } from "./provenance-recorder.js";
import { PublishedCatalogRepository } from "./published-catalog.repository.js";
import {
  PUBLISHING_REPOSITORY,
  type PublishingRepository,
} from "./publishing.repository.js";
import {
  PROVENANCE_REPOSITORY,
  type ProvenanceRepository,
} from "./provenance.repository.js";
import { ReaderLibraryController } from "./reader-library.controller.js";
import { RightsClearance } from "./rights-clearance.js";
import {
  RIGHTS_REPOSITORY,
  type RightsRepository,
} from "./rights.repository.js";
import {
  READER_LIBRARY_REPOSITORY,
  type ReaderLibraryRepository,
} from "./reader-library.repository.js";
import { ReaderLibraryService } from "./reader-library.service.js";
import { seedGovernedContent } from "./seed-governed-content.js";
import {
  ConfiguredStaffAccounts,
  STAFF_ACCOUNT_DIRECTORY,
  type StaffAccountDirectory,
} from "./staff-accounts.js";
import {
  STAFF_AUDIT_REPOSITORY,
  type StaffAuditRepository,
} from "./staff-audit.repository.js";
import {
  STAFF_CMS_REPOSITORY,
  type StaffCmsRepository,
} from "./staff-cms.repository.js";
import { StaffCmsController } from "./staff-cms.controller.js";
import { StaffCmsService } from "./staff-cms.service.js";
import { StaffOperationGate } from "./staff-operation-gate.js";
import { StaffProvenanceController } from "./staff-provenance.controller.js";
import { StaffPublishingController } from "./staff-publishing.controller.js";
import { StaffPublishingService } from "./staff-publishing.service.js";
import { StaffProvenanceService } from "./staff-provenance.service.js";
import { StaffQualityGateController } from "./staff-quality-gate.controller.js";
import { StaffQualityGateService } from "./staff-quality-gate.service.js";
import { StaffRightsController } from "./staff-rights.controller.js";
import { StaffRightsService } from "./staff-rights.service.js";
import { PostgresStaffCmsRepository } from "./postgres-staff-cms.repository.js";
import { StaffController } from "./staff.controller.js";
import { StaffService } from "./staff.service.js";
import { StaffEntitlementController } from "./staff-entitlement.controller.js";
import { StaffEntitlementService } from "./staff-entitlement.service.js";
import { StaffMetricsController } from "./staff-metrics.controller.js";
import { StaffMetricsService } from "./staff-metrics.service.js";

@Module({
  controllers: [
    CatalogController,
    HealthController,
    ReaderLibraryController,
    StaffCmsController,
    StaffController,
    StaffEntitlementController,
    StaffMetricsController,
    StaffProvenanceController,
    StaffPublishingController,
    StaffQualityGateController,
    StaffRightsController,
  ],
  providers: [
    {
      provide: PUBLISHING_REPOSITORY,
      useFactory: () =>
        process.env.DATABASE_URL
          ? new PostgresPublishingRepository(process.env.DATABASE_URL)
          : new InMemoryPublishingRepository(),
    },
    {
      // With a database, the catalog reads the join in SQL. Without one, it
      // reads the same thing from the stores this process holds, so a Chapter
      // published in a local run is public in the same breath.
      provide: CATALOG_REPOSITORY,
      useFactory: async (
        staffCmsRepository: StaffCmsRepository,
        publishingRepository: PublishingRepository,
        provenanceRepository: ProvenanceRepository,
        rightsRepository: RightsRepository,
      ) => {
        if (process.env.DATABASE_URL) {
          return new PostgresCatalogRepository(process.env.DATABASE_URL);
        }

        await seedGovernedContent({
          staffCmsRepository,
          publishingRepository,
          provenanceRepository,
          rightsRepository,
        });

        return new PublishedCatalogRepository(
          staffCmsRepository,
          publishingRepository,
        );
      },
      inject: [
        STAFF_CMS_REPOSITORY,
        PUBLISHING_REPOSITORY,
        PROVENANCE_REPOSITORY,
        RIGHTS_REPOSITORY,
      ],
    },
    {
      provide: CatalogService,
      useFactory: (
        catalogRepository: CatalogRepository,
        entitlementRequirementRepository: EntitlementRequirementRepository,
        readerLibraryRepository: ReaderLibraryRepository,
      ) =>
        new CatalogService(
          catalogRepository,
          entitlementRequirementRepository,
          readerLibraryRepository,
        ),
      inject: [
        CATALOG_REPOSITORY,
        ENTITLEMENT_REQUIREMENT_REPOSITORY,
        READER_LIBRARY_REPOSITORY,
      ],
    },
    {
      provide: ENTITLEMENT_REQUIREMENT_REPOSITORY,
      useFactory: () =>
        process.env.DATABASE_URL
          ? new PostgresEntitlementRequirementRepository(
              process.env.DATABASE_URL,
            )
          : new InMemoryEntitlementRequirementRepository(),
    },
    {
      provide: READER_LIBRARY_REPOSITORY,
      useFactory: () =>
        process.env.DATABASE_URL
          ? new PostgresReaderLibraryRepository(process.env.DATABASE_URL)
          : new InMemoryReaderLibraryRepository(),
    },
    {
      provide: ReaderLibraryService,
      useFactory: (
        readerLibraryRepository: ReaderLibraryRepository,
        catalogService: CatalogService,
        readingEngagementRepository: ReadingEngagementRepository,
      ) =>
        new ReaderLibraryService(
          readerLibraryRepository,
          catalogService,
          readingEngagementRepository,
        ),
      inject: [
        READER_LIBRARY_REPOSITORY,
        CatalogService,
        READING_ENGAGEMENT_REPOSITORY,
      ],
    },
    {
      provide: READING_ENGAGEMENT_REPOSITORY,
      useFactory: () => new InMemoryReadingEngagementRepository(),
    },
    {
      provide: GUARDRAIL_SIGNALS_SOURCE,
      useFactory: () => new BaselineGuardrailSignalsSource(),
    },
    {
      provide: STAFF_ACCOUNT_DIRECTORY,
      useFactory: () => new ConfiguredStaffAccounts(process.env.STAFF_ACCOUNTS),
    },
    {
      provide: STAFF_AUDIT_REPOSITORY,
      useFactory: () =>
        process.env.DATABASE_URL
          ? new PostgresStaffAuditRepository(process.env.DATABASE_URL)
          : new InMemoryStaffAuditRepository(),
    },
    {
      provide: StaffOperationGate,
      useFactory: (
        staffAccounts: StaffAccountDirectory,
        staffAuditRepository: StaffAuditRepository,
      ) => new StaffOperationGate(staffAccounts, staffAuditRepository),
      inject: [STAFF_ACCOUNT_DIRECTORY, STAFF_AUDIT_REPOSITORY],
    },
    {
      provide: StaffService,
      useFactory: (
        staffAccounts: StaffAccountDirectory,
        gate: StaffOperationGate,
        staffAuditRepository: StaffAuditRepository,
      ) => new StaffService(staffAccounts, gate, staffAuditRepository),
      inject: [
        STAFF_ACCOUNT_DIRECTORY,
        StaffOperationGate,
        STAFF_AUDIT_REPOSITORY,
      ],
    },
    {
      provide: STAFF_CMS_REPOSITORY,
      useFactory: () =>
        process.env.DATABASE_URL
          ? new PostgresStaffCmsRepository(process.env.DATABASE_URL)
          : new InMemoryStaffCmsRepository(),
    },
    {
      provide: RIGHTS_REPOSITORY,
      useFactory: () =>
        process.env.DATABASE_URL
          ? new PostgresRightsRepository(process.env.DATABASE_URL)
          : new InMemoryRightsRepository(),
    },
    {
      provide: RightsClearance,
      useFactory: (rightsRepository: RightsRepository) =>
        new RightsClearance(rightsRepository),
      inject: [RIGHTS_REPOSITORY],
    },
    {
      provide: PROVENANCE_REPOSITORY,
      useFactory: () =>
        process.env.DATABASE_URL
          ? new PostgresProvenanceRepository(process.env.DATABASE_URL)
          : new InMemoryProvenanceRepository(),
    },
    {
      provide: ProvenanceRecorder,
      useFactory: (provenanceRepository: ProvenanceRepository) =>
        new ProvenanceRecorder(provenanceRepository),
      inject: [PROVENANCE_REPOSITORY],
    },
    {
      provide: StaffCmsService,
      useFactory: (
        gate: StaffOperationGate,
        staffCmsRepository: StaffCmsRepository,
        rightsClearance: RightsClearance,
        provenanceRecorder: ProvenanceRecorder,
      ) =>
        new StaffCmsService(
          gate,
          staffCmsRepository,
          rightsClearance,
          provenanceRecorder,
        ),
      inject: [
        StaffOperationGate,
        STAFF_CMS_REPOSITORY,
        RightsClearance,
        ProvenanceRecorder,
      ],
    },
    {
      provide: StaffProvenanceService,
      useFactory: (
        gate: StaffOperationGate,
        provenanceRepository: ProvenanceRepository,
        staffCmsRepository: StaffCmsRepository,
      ) =>
        new StaffProvenanceService(
          gate,
          provenanceRepository,
          staffCmsRepository,
        ),
      inject: [StaffOperationGate, PROVENANCE_REPOSITORY, STAFF_CMS_REPOSITORY],
    },
    {
      provide: StaffPublishingService,
      useFactory: (
        gate: StaffOperationGate,
        staffCmsRepository: StaffCmsRepository,
        publishingRepository: PublishingRepository,
        provenanceRepository: ProvenanceRepository,
        provenanceRecorder: ProvenanceRecorder,
      ) =>
        new StaffPublishingService(
          gate,
          staffCmsRepository,
          publishingRepository,
          provenanceRepository,
          provenanceRecorder,
        ),
      inject: [
        StaffOperationGate,
        STAFF_CMS_REPOSITORY,
        PUBLISHING_REPOSITORY,
        PROVENANCE_REPOSITORY,
        ProvenanceRecorder,
      ],
    },
    {
      provide: StaffQualityGateService,
      useFactory: (
        gate: StaffOperationGate,
        staffCmsRepository: StaffCmsRepository,
        rightsRepository: RightsRepository,
        provenanceRepository: ProvenanceRepository,
        provenanceRecorder: ProvenanceRecorder,
      ) =>
        new StaffQualityGateService(
          gate,
          staffCmsRepository,
          rightsRepository,
          provenanceRepository,
          provenanceRecorder,
        ),
      inject: [
        StaffOperationGate,
        STAFF_CMS_REPOSITORY,
        RIGHTS_REPOSITORY,
        PROVENANCE_REPOSITORY,
        ProvenanceRecorder,
      ],
    },
    {
      provide: StaffRightsService,
      useFactory: (
        gate: StaffOperationGate,
        rightsRepository: RightsRepository,
      ) => new StaffRightsService(gate, rightsRepository),
      inject: [StaffOperationGate, RIGHTS_REPOSITORY],
    },
    {
      provide: StaffEntitlementService,
      useFactory: (
        gate: StaffOperationGate,
        staffCmsRepository: StaffCmsRepository,
        entitlementRequirementRepository: EntitlementRequirementRepository,
        readerLibraryRepository: ReaderLibraryRepository,
      ) =>
        new StaffEntitlementService(
          gate,
          staffCmsRepository,
          entitlementRequirementRepository,
          readerLibraryRepository,
        ),
      inject: [
        StaffOperationGate,
        STAFF_CMS_REPOSITORY,
        ENTITLEMENT_REQUIREMENT_REPOSITORY,
        READER_LIBRARY_REPOSITORY,
      ],
    },
    {
      provide: StaffMetricsService,
      useFactory: (
        gate: StaffOperationGate,
        readingEngagementRepository: ReadingEngagementRepository,
        guardrailSignalsSource: GuardrailSignalsSource,
      ) =>
        new StaffMetricsService(
          gate,
          readingEngagementRepository,
          guardrailSignalsSource,
        ),
      inject: [
        StaffOperationGate,
        READING_ENGAGEMENT_REPOSITORY,
        GUARDRAIL_SIGNALS_SOURCE,
      ],
    },
  ],
})
export class AppModule {}
