import type { ReadingEngagement } from "@novelx/shared";

export const READING_ENGAGEMENT_REPOSITORY = Symbol(
  "READING_ENGAGEMENT_REPOSITORY",
);

/**
 * The accepted reading engagements the north-star metric is read from.
 *
 * The MVP demo path stores them in memory; a deployment that wires a real store
 * writes the same events the boundary accepted, so the metric never reads an
 * engagement the boundary refused. Reads are bounded to a week window, which is
 * the window the metric is named for.
 */
export type ReadingEngagementRepository = {
  record(engagement: ReadingEngagement): Promise<void>;
  listBetween(weekStart: string, weekEnd: string): Promise<ReadingEngagement[]>;
};
