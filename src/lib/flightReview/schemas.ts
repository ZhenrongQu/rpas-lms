import { z } from "zod";

/** Student booking payload. `locale` selects the confirmation-email language. */
export const bookSchema = z.object({
  slotId: z.string().min(1),
  locale: z.enum(["en", "zh"]).default("en"),
});

/** Admin slot create/edit payload. `startsAt` is an ISO datetime (UTC). */
export const adminSlotSchema = z.object({
  startsAt: z.string().datetime(),
  durationMin: z.number().int().min(15).max(480),
  location: z.string().min(1),
  examinerName: z.string().min(1),
  examinerEmail: z.string().email().nullish(),
  examinerPhone: z.string().nullish(),
  notes: z.string().nullish(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
});

export type AdminSlotInput = z.infer<typeof adminSlotSchema>;

/** Admin grant/revoke flight_review eligibility by customer email. */
export const adminGrantSchema = z.object({
  email: z.string().email(),
});
