/**
 * How many records a staff listing answers with.
 *
 * A limit that was not asked for, was asked for as nonsense, or was asked for
 * beyond what one page carries falls back to a bounded page rather than turning
 * an append-only trail into an unbounded read.
 */
export function pageSize(
  limit: number | undefined,
  bounds: { fallback: number; max: number },
): number {
  if (!limit || !Number.isFinite(limit) || limit < 1) {
    return bounds.fallback;
  }

  return Math.min(Math.floor(limit), bounds.max);
}
