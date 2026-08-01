import type { ProvenanceEntry, ProvenanceTarget } from "@novelx/shared";

import type { ProvenanceRepository } from "./provenance.repository.js";

export class InMemoryProvenanceRepository implements ProvenanceRepository {
  private readonly entries: ProvenanceEntry[] = [];

  async append(entry: ProvenanceEntry): Promise<void> {
    this.entries.push(entry);
  }

  async listForSeries(input: {
    seriesId: string;
    limit: number;
  }): Promise<ProvenanceEntry[]> {
    return this.mostRecent(
      (entry) => entry.target.seriesId === input.seriesId,
      input.limit,
    );
  }

  async listForTarget(input: {
    target: ProvenanceTarget;
    limit: number;
  }): Promise<ProvenanceEntry[]> {
    return this.mostRecent(
      (entry) =>
        entry.target.seriesId === input.target.seriesId &&
        entry.target.kind === input.target.kind &&
        entry.target.id === input.target.id,
      input.limit,
    );
  }

  private mostRecent(
    matches: (entry: ProvenanceEntry) => boolean,
    limit: number,
  ): ProvenanceEntry[] {
    return this.entries.filter(matches).slice(-limit).reverse();
  }
}
