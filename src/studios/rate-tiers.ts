export type RateTier = {
  min_attendance: number;
  max_attendance: number | null;
  rate: number;
};

/**
 * Finds the bracket a given attendance count falls into. Returns null when
 * attendance hasn't been entered yet, or when no bracket covers it — callers
 * should treat that as "can't be priced yet" rather than guessing a number.
 */
export function resolveTierRate(
  tiers: RateTier[],
  attendance: number | null | undefined,
): number | null {
  if (attendance == null) return null;
  const tier = tiers.find(
    (t) =>
      attendance >= t.min_attendance &&
      (t.max_attendance == null || attendance <= t.max_attendance),
  );
  return tier ? tier.rate : null;
}
