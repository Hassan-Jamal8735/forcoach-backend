import * as ical from 'node-ical';

/**
 * Shared ICS parsing used by both feed sync and file upload, so the two paths
 * can't drift apart in how they interpret a calendar.
 */

export type ParsedIcsEvent = {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  startTime: string;
  endTime: string;
};

function isVEvent(
  item: ical.CalendarComponent | ical.VCalendar | undefined,
): item is ical.VEvent {
  return !!item && item.type === 'VEVENT';
}

/**
 * `window` is deliberately optional.
 *
 * Feed sync passes one, because a feed is a live view and re-reading the
 * distant past on every run is wasted work. File upload passes nothing: the
 * whole point of uploading a file is to backfill history that the feed no
 * longer publishes, so filtering old events out would defeat it.
 */
export function toUsableEvents(
  parsed: Record<string, ical.CalendarComponent | ical.VCalendar>,
  window?: { fromMs: number; toMs: number },
): ParsedIcsEvent[] {
  return Object.values(parsed)
    .filter(isVEvent)
    .filter(
      (item) =>
        item.status !== 'CANCELLED' &&
        !!item.uid &&
        !!item.start &&
        !!item.end &&
        (!window ||
          (item.start.getTime() >= window.fromMs &&
            item.start.getTime() <= window.toMs)),
    )
    .map((item) => ({
      uid: item.uid,
      title: typeof item.summary === 'string' ? item.summary : '(untitled)',
      description:
        typeof item.description === 'string' ? item.description : null,
      location: typeof item.location === 'string' ? item.location : null,
      startTime: item.start.toISOString(),
      endTime: item.end!.toISOString(),
    }));
}

export function parseIcsText(content: string): ParsedIcsEvent[] {
  return toUsableEvents(
    ical.parseICS(content) as Record<
      string,
      ical.CalendarComponent | ical.VCalendar
    >,
  );
}
