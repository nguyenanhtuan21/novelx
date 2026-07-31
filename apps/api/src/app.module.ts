import { Module } from "@nestjs/common";

import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from "./catalog.repository.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";
import { HealthController } from "./health.controller.js";
import { InMemoryReaderLibraryRepository } from "./in-memory-reader-library.repository.js";
import { PostgresCatalogRepository } from "./postgres-catalog.repository.js";
import { PostgresReaderLibraryRepository } from "./postgres-reader-library.repository.js";
import { ReaderLibraryController } from "./reader-library.controller.js";
import {
  READER_LIBRARY_REPOSITORY,
  type ReaderLibraryRepository,
} from "./reader-library.repository.js";
import { ReaderLibraryService } from "./reader-library.service.js";
import { SeedCatalogRepository } from "./seed-catalog.repository.js";

@Module({
  controllers: [CatalogController, HealthController, ReaderLibraryController],
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
  ],
})
export class AppModule {}
