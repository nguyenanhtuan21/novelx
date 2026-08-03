import type { GuardrailSignals } from "@novelx/shared";

export const GUARDRAIL_SIGNALS_SOURCE = Symbol("GUARDRAIL_SIGNALS_SOURCE");

/**
 * Where the guardrails Weekly Engaged Reading Hours is read against come from.
 *
 * Each dimension is a baseline hook (CONTEXT: Weekly Engaged Reading Hours):
 * real sources — retention cohorts, the report queue, AI cost accounting, the ad
 * complaint desk — arrive later, so a source that has none yet returns absent
 * signals rather than zeros, because the absence of a measurement is not the
 * measurement zero.
 */
export type GuardrailSignalsSource = {
  read(): Promise<GuardrailSignals>;
};
