"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_API_BASE } from "@/lib/admin/route";
import { formatSlotDateTime } from "@/lib/flightReview/format";

type Slot = {
  id: string;
  startsAt: string;
  durationMin: number;
  location: string;
  examinerName: string;
  examinerEmail: string | null;
  examinerPhone: string | null;
  notes: string | null;
  status: string;
  booking: { name: string; email: string | null; phone: string | null } | null;
};

const SLOTS_API = `${ADMIN_API_BASE}/flight-review/slots`;
const GRANT_API = `${ADMIN_API_BASE}/flight-review/grant`;

export default function FlightReviewAdmin({ initialSlots }: { initialSlots: Slot[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New-slot form state
  const [startsAt, setStartsAt] = useState("");
  const [durationMin, setDurationMin] = useState(60);
  const [location, setLocation] = useState("");
  const [examinerName, setExaminerName] = useState("");
  const [examinerEmail, setExaminerEmail] = useState("");
  const [examinerPhone, setExaminerPhone] = useState("");
  const [notes, setNotes] = useState("");

  // Eligibility form state
  const [grantEmail, setGrantEmail] = useState("");

  async function send(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
        setMsg(`Error (${res.status}): ${JSON.stringify(data?.error ?? "request failed")}`);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setMsg("Network error — please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!startsAt || !location || !examinerName) {
      setMsg("Date/time, location, and examiner name are required.");
      return;
    }
    const ok = await send(SLOTS_API, "POST", {
      startsAt: new Date(startsAt).toISOString(),
      durationMin: Number(durationMin),
      location,
      examinerName,
      examinerEmail: examinerEmail || null,
      examinerPhone: examinerPhone || null,
      notes: notes || null,
    });
    if (ok) {
      setStartsAt("");
      setLocation("");
      setExaminerName("");
      setExaminerEmail("");
      setExaminerPhone("");
      setNotes("");
      setMsg("Slot created.");
    }
  }

  async function toggleArchive(slot: Slot) {
    await send(`${SLOTS_API}/${slot.id}`, "PUT", {
      startsAt: slot.startsAt,
      durationMin: slot.durationMin,
      location: slot.location,
      examinerName: slot.examinerName,
      examinerEmail: slot.examinerEmail,
      examinerPhone: slot.examinerPhone,
      notes: slot.notes,
      status: slot.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE",
    });
  }

  async function deleteSlot(id: string) {
    if (!window.confirm("Delete this slot? (Blocked if a student has booked it.)")) return;
    await send(`${SLOTS_API}/${id}`, "DELETE");
  }

  async function grant(method: "POST" | "DELETE") {
    if (!grantEmail) {
      setMsg("Enter a customer email.");
      return;
    }
    const ok = await send(GRANT_API, method, { email: grantEmail });
    if (ok) setMsg(method === "POST" ? `Granted flight_review to ${grantEmail}.` : `Revoked flight_review from ${grantEmail}.`);
  }

  return (
    <div className="fr-admin">
      {msg && <p className="admin-empty">{msg}</p>}

      <section style={{ marginBottom: 24 }}>
        <h2>Eligibility</h2>
        <p className="admin-empty">Grant or revoke the flight_review entitlement. The student also needs PAID access.</p>
        <div className="admin-filters">
          <input
            type="email"
            placeholder="customer@email.com"
            value={grantEmail}
            onChange={(e) => setGrantEmail(e.target.value)}
          />
          <button type="button" disabled={busy} onClick={() => grant("POST")}>
            Grant
          </button>
          <button type="button" disabled={busy} onClick={() => grant("DELETE")}>
            Revoke
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>New slot</h2>
        <p className="admin-empty">Enter the date/time in your local timezone; the table shows it in Pacific time.</p>
        <form onSubmit={createSlot} className="admin-filters" style={{ flexWrap: "wrap" }}>
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          <input
            type="number"
            min={15}
            max={480}
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            placeholder="Duration (min)"
          />
          <input placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} required />
          <input placeholder="Examiner name" value={examinerName} onChange={(e) => setExaminerName(e.target.value)} required />
          <input placeholder="Examiner email" value={examinerEmail} onChange={(e) => setExaminerEmail(e.target.value)} />
          <input placeholder="Examiner phone" value={examinerPhone} onChange={(e) => setExaminerPhone(e.target.value)} />
          <input placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button type="submit" disabled={busy}>
            + Create slot
          </button>
        </form>
      </section>

      <table className="admin-table">
        <thead>
          <tr>
            <th>When (Pacific)</th>
            <th>Min</th>
            <th>Location</th>
            <th>Examiner</th>
            <th>Status</th>
            <th>Booked by</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {initialSlots.map((s) => (
            <tr key={s.id}>
              <td>{formatSlotDateTime(new Date(s.startsAt), "en")}</td>
              <td>{s.durationMin}</td>
              <td>{s.location}</td>
              <td>{s.examinerName}</td>
              <td>{s.status}</td>
              <td>
                {s.booking ? (
                  <span>
                    {s.booking.name}
                    {s.booking.email ? ` · ${s.booking.email}` : ""}
                    {s.booking.phone ? ` · ${s.booking.phone}` : ""}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td>
                <button type="button" disabled={busy} onClick={() => toggleArchive(s)}>
                  {s.status === "ACTIVE" ? "Archive" : "Unarchive"}
                </button>{" "}
                <button type="button" disabled={busy} onClick={() => deleteSlot(s.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {initialSlots.length === 0 && <p className="admin-empty">No slots yet. Create one above.</p>}
    </div>
  );
}
