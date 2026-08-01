import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import {
  createProvenanceEntry,
  provenanceSource,
  type AiWorkflowPrincipal,
  type ProvenanceEntry,
  type ProvenanceSubject,
  type StaffPrincipal,
} from "@novelx/shared";

import type { ProvenanceRepository } from "./provenance.repository.js";

export type ProvenanceRecorderOptions = {
  now?: () => string;
  nextEntryId?: () => string;
};

/**
 * Writes a content change down as lineage: the one way an entry reaches the
 * Provenance Ledger, so no caller mints an id or a time of its own.
 *
 * An entry is recorded after the change is held, so the ledger says what
 * happened rather than what was attempted: a refused operation leaves evidence
 * in the Staff Audit Record, which is the trail for attempts, while this one is
 * the trail for content (ADR-0008).
 */
@Injectable()
export class ProvenanceRecorder {
  private readonly now: () => string;
  private readonly nextEntryId: () => string;

  constructor(
    private readonly provenanceRepository: ProvenanceRepository,
    options: ProvenanceRecorderOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.nextEntryId = options.nextEntryId ?? (() => randomUUID());
  }

  async record(input: {
    /** Staff or an AI workflow run: the ledger keeps them apart. */
    actor: StaffPrincipal | AiWorkflowPrincipal;
    action: string;
    subject: ProvenanceSubject;
  }): Promise<ProvenanceEntry> {
    const entry = createProvenanceEntry({
      id: this.nextEntryId(),
      source: provenanceSource(input.actor),
      action: input.action,
      subject: input.subject,
      recordedAt: this.now(),
    });

    await this.provenanceRepository.append(entry);

    return entry;
  }
}
