import type { ReadingEngagement } from "@novelx/shared";

import type { ReadingEngagementRepository } from "./reading-engagement.repository.js";

/**
 * The in-memory store the MVP demo path reads Weekly Engaged Reading Hours
 * from. A deployment with a database replaces this without moving the boundary,
 * so the metric reads the same accepted engagements either way.
 */
export class InMemoryReadingEngagementRepository implements ReadingEngagementRepository {
  private readonly engagements: ReadingEngagement[] = [];

  async record(engagement: ReadingEngagement): Promise<void> {
    this.engagements.push(engagement);
  }

  async listBetween(
    weekStart: string,
    weekEnd: string,
  ): Promise<ReadingEngagement[]> {
    const start = Date.parse(weekStart);
    const end = Date.parse(weekEnd);

    return this.engagements.filter((engagement) => {
      const at = Date.parse(engagement.occurredAt);
      return at >= start && at < end;
    });
  }
}
