/**
 * The complete set of product-analytics events (PRD U7).
 *
 * A closed union, not free-form strings: U7's first design rule is that every
 * name reads `object_action`, and a type is the only version of that rule which
 * cannot be forgotten six months from now. Adding an event means adding it here,
 * which is exactly the moment to check the name against its neighbours.
 */
export type AnalyticsEvent =
  // Conversion funnel: landing → taster → account → payment.
  | "landing_viewed"
  | "taster_started"
  | "taster_completed"
  | "user_registered"
  | "pricing_viewed"
  | "checkout_initiated"
  | "payment_succeeded"
  // Learning funnel: course → lesson → checkpoint → mock exam.
  | "course_started"
  | "lesson_completed"
  | "checkpoint_answered"
  | "exam_started";

export type AnalyticsProperties = Record<string, string | number | boolean | null>;
