import type { GuardrailSignals } from "@novelx/shared";

import type { GuardrailSignalsSource } from "./guardrail-signals-source.js";

/**
 * The baseline guardrail source the MVP demo path reads. None of the four
 * dimensions has a real source yet, so each is absent rather than zero: the
 * hook is in place for a real source to fill, which is what the metric output
 * makes visible.
 */
export class BaselineGuardrailSignalsSource implements GuardrailSignalsSource {
  async read(): Promise<GuardrailSignals> {
    return {};
  }
}
