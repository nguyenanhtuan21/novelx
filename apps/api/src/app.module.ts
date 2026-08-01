import { Module } from "@nestjs/common";

import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from "./catalog.repository.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";
import { HealthController } from "./health.controller.js";
import { InMemoryReaderLibraryRepository } from "./in-memory-reader-library.repository.js";
import { InMemoryStaffAuditRepository } from "./in-memory-staff-audit.repository.js";
import { PostgresCatalogRepository } from "./postgres-catalog.repository.js";
import { PostgresReaderLibraryRepository } from "./postgres-reader-library.repository.js";
import { PostgresStaffAuditRepository } from "./postgres-staff-audit.repository.js";
import { ReaderLibraryController } from "./reader-library.controller.js";
import {
  READER_LIBRARY_REPOSITORY,
  type ReaderLibraryRepository,
} from "./reader-library.repository.js";
import { ReaderLibraryService } from "./reader-library.service.js";
import { SeedCatalogRepository } from "./seed-catalog.repository.js";
import {
  ConfiguredStaffAccounts,
  STAFF_ACCOUNT_DIRECTORY,
  type StaffAccountDirectory,
} from "./staff-accounts.js";
import {
  STAFF_AUDIT_REPOSITORY,
  type StaffAuditRepository,
} from "./staff-audit.repository.js";
import { StaffController } from "./staff.controller.js";
import { StaffService } from "./staff.service.js";

@Module({
  controllers: [
    CatalogController,
    HealthController,
    ReaderLibraryController,
    StaffController,
  ],
  providers: [
    {
      provide: CATALOG_REPOSITORY,
      useFactory: () =>
        process.env.DATABASE_URL
          ? new PostgresCatalogRepository(process.env.DATABASE_URL)
          : new SeedCatalogRepository(),
    },
    {
      provide: CatalogService,
      useFactory: (catalogRepository: CatalogRepository) =>
        new CatalogService(catalogRepository),
      inject: [CATALOG_REPOSITORY],
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
      ) => new ReaderLibraryService(readerLibraryRepository, catalogService),
      inject: [READER_LIBRARY_REPOSITORY, CatalogService],
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
      provide: StaffService,
      useFactory: (
        staffAccounts: StaffAccountDirectory,
        staffAuditRepository: StaffAuditRepository,
      ) => new StaffService(staffAccounts, staffAuditRepository),
      inject: [STAFF_ACCOUNT_DIRECTORY, STAFF_AUDIT_REPOSITORY],
    },
  ],
})
export class AppModule {}
