import { env } from "../config";

/** Calendar date YYYY-MM-DD in the shop timezone. */
export function calendarDateInShopTz(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: env.CHECKIN_CALENDAR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
