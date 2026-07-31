import { Module } from "@nestjs/common";

import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from "./catalog.repository.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";
import { HealthController } from "./health.controller.js";
import { PostgresCatalogRepository } from "./postgres-catalog.repository.js";
import { PostgresReaderProgressRepository } from "./postgres-reader-progress.repository.js";
import {
  READER_PROGRESS_REPOSITORY,
  type ReaderProgressRepository,
} from "./reader-progress.repository.js";
import {
  ReaderAccountProgressController,
  ReaderProgressController,
} from "./reader-progress.controller.js";
import { ReaderProgressService } from "./reader-progress.service.js";
import { SeedCatalogRepository } from "./seed-catalog.repository.js";
import { SeedReaderProgressRepository } from "./seed-reader-progress.repository.js";

@Module({
  controllers: [
    CatalogController,
    HealthController,
    ReaderProgressController,
    ReaderAccountProgressController,
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
      provide: READER_PROGRESS_REPOSITORY,
      useFactory: () =>
        process.env.DATABASE_URL
          ? new PostgresReaderProgressRepository(process.env.DATABASE_URL)
          : new SeedReaderProgressRepository(),
    },
    {
      provide: ReaderProgressService,
      useFactory: (
        catalogService: CatalogService,
        readerProgressRepository: ReaderProgressRepository,
      ) => new ReaderProgressService(catalogService, readerProgressRepository),
      inject: [CatalogService, READER_PROGRESS_REPOSITORY],
    },
  ],
})
export class AppModule {}
