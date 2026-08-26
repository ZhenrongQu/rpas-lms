import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const STUDENT = {
  id: "e2e-student",
  email: "e2e-student@rpas.test",
  password: "e2e-password-123",
};

/** Far enough out that cancelling lands inside the ≥48h refund window (N15). */
export const SLOT_DAYS_AHEAD = 10;

/**
 * One paid student holding one unspent Flight Review credit, and two open slots.
 *
 * Two, not one: the journey books the first and must then prove the second is
 * still offered — a single slot cannot distinguish "the list rendered" from
 * "the list is empty for the right reason".
 */
export async function seedFlightReviewJourney(prisma: PrismaClient): Promise<void> {
  const verifiedAt = new Date();
  await prisma.customer.create({
    data: {
      id: STUDENT.id,
      email: STUDENT.email,
      userNumber: 1,
      displayName: "E2E Student",
      hashedPassword: await bcrypt.hash(STUDENT.password, 10),
      emailVerifiedAt: verifiedAt,
      accessTier: "PAID",
    },
  });

  // The shape a normally-verified account has, so sign-in takes the real path.
  await prisma.userIdentity.create({
    data: {
      userId: STUDENT.id,
      provider: "email",
      providerAccountId: STUDENT.email,
      verifiedAt,
    },
  });

  await prisma.flightReviewCredit.create({
    data: { customerId: STUDENT.id, source: "course_bundle" },
  });

  const base = Date.now() + SLOT_DAYS_AHEAD * 24 * 60 * 60 * 1000;
  await prisma.flightReviewSlot.createMany({
    data: [
      {
        id: "e2e-slot-a",
        startsAt: new Date(base),
        durationMin: 60,
        location: "Vancouver E2E Field",
        examinerName: "Examiner Alpha",
      },
      {
        id: "e2e-slot-b",
        startsAt: new Date(base + 60 * 60 * 1000),
        durationMin: 60,
        location: "Vancouver E2E Field",
        examinerName: "Examiner Bravo",
      },
    ],
  });
}
