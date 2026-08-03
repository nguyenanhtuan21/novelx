import { Pool } from "pg";

import type {
  EntitlementBenefit,
  EntitlementRequirement,
} from "@novelx/shared";

import type { EntitlementRequirementRepository } from "./entitlement-requirement.repository.js";

type RequirementRow = {
  chapter_id: string;
  benefit: EntitlementBenefit;
};

export class PostgresEntitlementRequirementRepository implements EntitlementRequirementRepository {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async saveRequirement(requirement: EntitlementRequirement): Promise<void> {
    await this.pool.query(
      `insert into chapter_entitlement_requirements (chapter_id, benefit)
       values ($1, $2)
       on conflict (chapter_id) do update set benefit = excluded.benefit`,
      [requirement.chapterId, requirement.benefit],
    );
  }

  async findRequirement(
    chapterId: string,
  ): Promise<EntitlementRequirement | undefined> {
    const found = await this.pool.query<RequirementRow>(
      `select chapter_id, benefit
         from chapter_entitlement_requirements
        where chapter_id = $1`,
      [chapterId],
    );
    const row = found.rows[0];

    return row
      ? Object.freeze({
          chapterId: row.chapter_id,
          benefit: row.benefit,
        })
      : undefined;
  }
}
