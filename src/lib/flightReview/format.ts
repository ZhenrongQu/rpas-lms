/**
 * Slots are stored in UTC but the appointment is physical, so we always present
 * the time in the business timezone (Pacific) with the zone shown explicitly —
 * the single most common source of booking-system confusion.
 */
export const BUSINESS_TIMEZONE = "America/Vancouver";

export function formatSlotDateTime(startsAt: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-CA", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: BUSINESS_TIMEZONE,
  }).format(startsAt);
}
