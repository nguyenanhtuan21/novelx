import { Injectable } from "@nestjs/common";
import {
  weeklyEngagedReadingHours,
  WEEKLY_ENGAGED_READING_HOURS_WINDOW_DAYS,
  type WeeklyEngagedReadingHoursMetric,
} from "@novelx/shared";

import type { GuardrailSignalsSource } from "./guardrail-signals-source.js";
import type { ReadingEngagementRepository } from "./reading-engagement.repository.js";
import {
  type StaffOperation,
  StaffOperationGate,
} from "./staff-operation-gate.js";

export const METRICS_TARGET = "metrics:weekly-engaged-reading-hours";

export type StaffMetricsServiceOptions = {
  now?: () => string;
};

/**
 * The staff-facing read of Weekly Engaged Reading Hours and its guardrails,
 * which is the basic metric output a product or staff user inspects for the MVP
 * demo path (CONTEXT: Weekly Engaged Reading Hours).
 *
 * The week window is the last `WEEKLY_ENGAGED_READING_HOURS_WINDOW_DAYS` days
 * ending now, so the metric always answers "this week". Engagements accepted at
 * the boundary are summed into hours, and the guardrails travel alongside so the
 * north-star is read against retention, report rate, AI cost, and ad complaints
 * rather than in isolation.
 */
@Injectable()
export class StaffMetricsService {
  private readonly now: () => string;

  constructor(
    private readonly gate: StaffOperationGate,
    private readonly readingEngagementRepository: ReadingEngagementRepository,
    private readonly guardrailSignalsSource: GuardrailSignalsSource,
    options: StaffMetricsServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async readWeeklyEngagedReadingHours(input: {
    principal: Parameters<StaffOperationGate["run"]>[0];
  }): Promise<WeeklyEngagedReadingHoursMetric> {
    const operation: StaffOperation = {
      action: "staff.metrics.weekly-engaged-reading-hours.read",
      target: METRICS_TARGET,
      permission: "metrics:read",
    };

    return this.gate.run(input.principal, operation, async () => {
      const weekEnd = this.now();
      const weekStart = new Date(
        Date.parse(weekEnd) -
          WEEKLY_ENGAGED_READING_HOURS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

      const [engagements, guardrails] = await Promise.all([
        this.readingEngagementRepository.listBetween(weekStart, weekEnd),
        this.guardrailSignalsSource.read(),
      ]);

      return {
        weeklyEngagedReadingHours: weeklyEngagedReadingHours({
          engagements,
          weekStart,
          weekEnd,
        }),
        guardrails,
      };
    });
  }
}
