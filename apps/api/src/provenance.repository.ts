import type { ProvenanceEntry, ProvenanceTarget } from "@novelx/shared";

export const PROVENANCE_REPOSITORY = Symbol("PROVENANCE_REPOSITORY");

/**
 * The Provenance Ledger Core Platform holds: how content and AI workflow
 * artifacts were created and changed (ADR-0008).
 *
 * There is deliberately no update or delete. Lineage that can be rewritten
 * says nothing about how content was made, so a correction is a later entry
 * rather than a quieter edit of an earlier one. Both lookups return the most
 * recent entry first.
 */
export type ProvenanceRepository = {
  append(entry: ProvenanceEntry): Promise<void>;
  /** Everything traced under one Series, whatever artifact it was about. */
  listForSeries(input: {
    seriesId: string;
    limit: number;
  }): Promise<ProvenanceEntry[]>;
  /** One artifact's own lineage; the target names the Series that holds it. */
  listForTarget(input: {
    target: ProvenanceTarget;
    limit: number;
  }): Promise<ProvenanceEntry[]>;
};
