/**
 * Picks the studio an imported class belongs to, from its title and location.
 *
 * Calendar exports (Mindbody, bsport, Google) usually carry the studio name in
 * the event location, e.g. "BANOTE CLUB PARIS 16E\n71 Avenue Victor Hugo...".
 * Matching against that means a coach teaching at several studios doesn't have
 * to assign every class by hand.
 *
 * The rules are deliberately literal rather than fuzzy. A wrong auto-assignment
 * silently corrupts an invoice, which is worse than leaving a class unassigned
 * for the coach to sort out, so anything ambiguous is left alone.
 */

export type MatchableStudio = {
  id: string;
  name: string;
  match_keywords: string[];
};

// Shortest keyword we'll match on. Below this, collisions get too likely
// ("Hub" appearing inside an unrelated class title, for example).
const MIN_KEYWORD_LENGTH = 3;

/** Lowercase, strip accents, collapse whitespace. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function keywordsFor(studio: MatchableStudio): string[] {
  const extras = (studio.match_keywords ?? [])
    .map(normalize)
    .filter((k) => k.length >= MIN_KEYWORD_LENGTH);

  const name = normalize(studio.name);
  const fromName = name.length >= MIN_KEYWORD_LENGTH ? [name] : [];

  return Array.from(new Set([...extras, ...fromName]));
}

/**
 * Returns the matching studio id, or null when nothing matched or more than one
 * studio matched.
 */
export function matchStudio(
  studios: MatchableStudio[],
  event: { title?: string | null; location?: string | null },
): string | null {
  const haystack = normalize(
    `${event.title ?? ''} ${event.location ?? ''}`.trim(),
  );
  if (!haystack) return null;

  const hits = studios.filter((studio) =>
    keywordsFor(studio).some((keyword) => haystack.includes(keyword)),
  );

  return hits.length === 1 ? hits[0].id : null;
}

/**
 * Resolves the studio for a freshly imported event: keyword match first, then
 * the connection's configured default, then unassigned.
 */
export function resolveStudioForImport(
  studios: MatchableStudio[],
  event: { title?: string | null; location?: string | null },
  defaultStudioId: string | null,
): string | null {
  return matchStudio(studios, event) ?? defaultStudioId ?? null;
}
