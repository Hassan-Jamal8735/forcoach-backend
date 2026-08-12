import { matchStudio, type MatchableStudio } from '../events/studio-matcher';

/**
 * Derives candidate studios from a coach's imported classes.
 *
 * Calendar exports name the venue in the event location, usually as a first
 * line followed by a street address, e.g.
 *   "BANOTE CLUB PARIS 16E\n71 Avenue Victor Hugo, Paris, 75116, FR"
 *
 * Reading that lets a coach connect a calendar and be offered their studios,
 * rather than having to create each one by hand and hope the matching works.
 */

export type SuggestibleEvent = {
  title: string;
  location: string | null;
};

export type StudioSuggestion = {
  /** Shown to the coach and used as the studio name. */
  label: string;
  /** Seeded into match_keywords so the classes it came from attach straight away. */
  keyword: string;
  classCount: number;
  sampleTitle: string;
  /** True when derived from the class title because no location was present. */
  fromTitle: boolean;
};

// A venue name longer than this is almost certainly a full address or a
// description rather than something worth naming a studio after.
const MAX_LABEL_LENGTH = 60;
const MIN_LABEL_LENGTH = 3;

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0]?.trim() ?? '';
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Picks the text to name a studio after: the first line of the location if
 * there is one, otherwise the class title so a coach whose feed omits
 * locations still gets something useful.
 */
function labelFor(
  event: SuggestibleEvent,
): { label: string; fromTitle: boolean } | null {
  const fromLocation = event.location ? firstLine(event.location) : '';
  if (
    fromLocation.length >= MIN_LABEL_LENGTH &&
    fromLocation.length <= MAX_LABEL_LENGTH
  ) {
    return { label: fromLocation, fromTitle: false };
  }

  const title = event.title?.trim() ?? '';
  if (title.length >= MIN_LABEL_LENGTH && title.length <= MAX_LABEL_LENGTH) {
    return { label: title, fromTitle: true };
  }

  return null;
}

export function buildStudioSuggestions(
  events: SuggestibleEvent[],
  existingStudios: MatchableStudio[],
): StudioSuggestion[] {
  const groups = new Map<string, StudioSuggestion>();

  for (const event of events) {
    // Skip anything an existing studio already covers, so we never suggest a
    // duplicate of a studio the coach has already set up.
    if (matchStudio(existingStudios, event)) continue;

    const derived = labelFor(event);
    if (!derived) continue;

    const key = normalizeKey(derived.label);
    const existing = groups.get(key);
    if (existing) {
      existing.classCount += 1;
    } else {
      groups.set(key, {
        label: derived.label,
        keyword: derived.label,
        classCount: 1,
        sampleTitle: event.title,
        fromTitle: derived.fromTitle,
      });
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => b.classCount - a.classCount,
  );
}
