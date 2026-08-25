import { prisma } from "@/lib/db";
import FlightReviewAdmin from "./FlightReviewAdmin";

export default async function AdminFlightReviewPage() {
  const slots = await prisma.flightReviewSlot.findMany({
    include: {
      // Only the in-progress booking occupies the slot; cancelled ones are history.
      bookings: {
        where: { status: "BOOKED" },
        include: { customer: { select: { displayName: true, email: true, phone: true } } },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  const data = slots.map((s) => ({
    id: s.id,
    startsAt: s.startsAt.toISOString(),
    durationMin: s.durationMin,
    location: s.location,
    examinerName: s.examinerName,
    examinerEmail: s.examinerEmail,
    examinerPhone: s.examinerPhone,
    notes: s.notes,
    status: s.status,
    booking: s.bookings[0]
      ? {
          id: s.bookings[0].id,
          name: s.bookings[0].customer.displayName ?? s.bookings[0].customer.email ?? "—",
          email: s.bookings[0].customer.email,
          phone: s.bookings[0].customer.phone,
        }
      : null,
  }));

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>Flight Reviews</h1>
      </div>
      <FlightReviewAdmin initialSlots={data} />
    </div>
  );
}
