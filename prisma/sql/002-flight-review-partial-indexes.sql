-- Partial unique indexes for Flight Review bookings (PRD U13 §13.2).
--
-- Cancelling a booking now sets status = 'CANCELLED' instead of deleting the row,
-- so a plain UNIQUE on slotId or customerId would block every re-book. The
-- invariants only apply to bookings that are still in progress:
--
--   * one in-progress booking per slot     (was: slotId @unique)
--   * one in-progress booking per customer (was: customerId @unique)
--
-- Prisma cannot declare a WHERE clause on an index, so these live here and are
-- applied by `pnpm db:indexes`. Without them, "one active booking per customer"
-- degrades from a database guarantee to an application-level check-then-write,
-- which has a race window under concurrent requests.

CREATE UNIQUE INDEX IF NOT EXISTS "FlightReviewBooking_active_slot_key"
  ON "FlightReviewBooking" ("slotId")
  WHERE status = 'BOOKED';

CREATE UNIQUE INDEX IF NOT EXISTS "FlightReviewBooking_active_customer_key"
  ON "FlightReviewBooking" ("customerId")
  WHERE status = 'BOOKED';
