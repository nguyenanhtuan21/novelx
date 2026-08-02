import { InMemoryProvenanceRepository } from "./in-memory-provenance.repository.js";
import { InMemoryPublishingRepository } from "./in-memory-publishing.repository.js";
import { InMemoryRightsRepository } from "./in-memory-rights.repository.js";
import { InMemoryStaffCmsRepository } from "./in-memory-staff-cms.repository.js";
import { PublishedCatalogRepository } from "./published-catalog.repository.js";
import { seedGovernedContent } from "./seed-governed-content.js";
import type { CatalogRepository } from "./catalog.repository.js";

/**
 * The public catalog a local run starts with, for tests that need a Series
 * readers can open. It is built the way the deployment builds it — seed the
 * stores, then read the catalog off them — so a test cannot pass against a
 * catalog assembled some way the application never assembles one.
 */
export async function seededCatalogRepository(): Promise<CatalogRepository> {
  const staffCmsRepository = new InMemoryStaffCmsRepository();
  const publishingRepository = new InMemoryPublishingRepository();

  await seedGovernedContent({
    staffCmsRepository,
    publishingRepository,
    provenanceRepository: new InMemoryProvenanceRepository(),
    rightsRepository: new InMemoryRightsRepository(),
  });

  return new PublishedCatalogRepository(
    staffCmsRepository,
    publishingRepository,
  );
}
