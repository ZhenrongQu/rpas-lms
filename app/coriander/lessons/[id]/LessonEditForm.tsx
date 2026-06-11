"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_BASE, ADMIN_API_BASE } from "@/lib/admin/route";

type LessonRow = {
  id: string;
  lessonId: string;
  course: string;
  moduleId: string;
  slug: string;
  order: number;
  estMinutes: number;
  certLevel: string;
  access: string;
  titleEN: string;
  titleZH: string;
  bodyEN: string;
  bodyZH: string;
};

type Props = { lesson: LessonRow };

export default function LessonEditForm({ lesson }: Props) {
  const router = useRouter();

  const [titleEN, setTitleEN] = useState(lesson.titleEN);
  const [titleZH, setTitleZH] = useState(lesson.titleZH);
  const [order, setOrder] = useState(lesson.order);
  const [estMinutes, setEstMinutes] = useState(lesson.estMinutes);
  const [certLevel, setCertLevel] = useState(lesson.certLevel);
  const [access, setAccess] = useState(lesson.access);
  const [bodyEN, setBodyEN] = useState(lesson.bodyEN);
  const [bodyZH, setBodyZH] = useState(lesson.bodyZH);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleSave() {
    setSaving(true);
    setErrors([]);
    try {
      const res = await fetch(`${ADMIN_API_BASE}/lessons/${lesson.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleEN, titleZH, order, estMinutes, certLevel, access, bodyEN, bodyZH }),
      });
      if (!res.ok) {
        const data = await res.json();
        if (data.details) {
          setErrors(data.details as string[]);
        } else if (data.error?.fieldErrors) {
          setErrors(Object.values(data.error.fieldErrors as Record<string, string[]>).flat());
        } else {
          setErrors([data.error ?? "Save failed"]);
        }
        return;
      }
      router.push(`${ADMIN_BASE}/lessons`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>Edit lesson</h1>
        <span className="admin-readonly-badge">{lesson.lessonId}</span>
      </div>

      {errors.length > 0 && (
        <ul className="admin-errors">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      <div className="admin-form">
        {/* Read-only identifiers */}
        <div className="admin-form-row">
          <label>Course / Module / Slug</label>
          <span className="admin-readonly">{lesson.course} / {lesson.moduleId} / {lesson.slug}</span>
        </div>

        <div className="admin-form-row">
          <label>Title EN</label>
          <input value={titleEN} onChange={(e) => setTitleEN(e.target.value)} />
        </div>
        <div className="admin-form-row">
          <label>Title ZH</label>
          <input value={titleZH} onChange={(e) => setTitleZH(e.target.value)} />
        </div>
        <div className="admin-form-row">
          <label>Order</label>
          <input type="number" min={1} value={order} onChange={(e) => setOrder(Number(e.target.value))} />
        </div>
        <div className="admin-form-row">
          <label>Est. minutes</label>
          <input type="number" min={1} value={estMinutes} onChange={(e) => setEstMinutes(Number(e.target.value))} />
        </div>
        <div className="admin-form-row">
          <label>Cert level</label>
          <select value={certLevel} onChange={(e) => setCertLevel(e.target.value)}>
            <option>BASIC</option>
            <option>ADVANCED</option>
            <option>BOTH</option>
          </select>
        </div>
        <div className="admin-form-row">
          <label>Access</label>
          <select value={access} onChange={(e) => setAccess(e.target.value)}>
            <option>FREE</option>
            <option>PAID</option>
          </select>
        </div>

        {/* MDX bodies — D2/D3 note */}
        <p className="admin-hint">
          Bodies are raw MDX. Checkpoints use{" "}
          <code>{'<Checkpoint questionId="air-law-0001" />'}</code>.
          EN and ZH must reference the same set of questionIds.
          D2/D3 lessons may have multiple Checkpoints.
        </p>
        <div className="admin-form-row admin-form-row--tall">
          <label>Body EN (MDX)</label>
          <textarea
            value={bodyEN}
            onChange={(e) => setBodyEN(e.target.value)}
            rows={20}
            className="admin-mdx-textarea"
            spellCheck={false}
          />
        </div>
        <div className="admin-form-row admin-form-row--tall">
          <label>Body ZH (MDX)</label>
          <textarea
            value={bodyZH}
            onChange={(e) => setBodyZH(e.target.value)}
            rows={20}
            className="admin-mdx-textarea"
            spellCheck={false}
          />
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
