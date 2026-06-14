"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MODULE_IDS } from "@/lib/content/types";
import { ADMIN_BASE, ADMIN_API_BASE } from "@/lib/admin/route";
import VideoUpload from "./VideoUpload";

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
  videoUid: string | null;
  videoStatus: string | null;
};

type Props = { lesson: LessonRow | null };

export default function LessonEditForm({ lesson }: Props) {
  const router = useRouter();
  const isNew = lesson === null;

  // Identity fields — editable only when creating (read-only once a lesson exists,
  // because lessonId is an FK target for LessonProgress).
  const [course, setCourse] = useState(lesson?.course ?? "basic");
  const [moduleId, setModuleId] = useState(lesson?.moduleId ?? MODULE_IDS[0]);
  const [slug, setSlug] = useState(lesson?.slug ?? "");

  const [titleEN, setTitleEN] = useState(lesson?.titleEN ?? "");
  const [titleZH, setTitleZH] = useState(lesson?.titleZH ?? "");
  const [order, setOrder] = useState(lesson?.order ?? 1);
  const [estMinutes, setEstMinutes] = useState(lesson?.estMinutes ?? 5);
  const [certLevel, setCertLevel] = useState(lesson?.certLevel ?? "BASIC");
  const [access, setAccess] = useState(lesson?.access ?? "FREE");
  const [bodyEN, setBodyEN] = useState(lesson?.bodyEN ?? "");
  const [bodyZH, setBodyZH] = useState(lesson?.bodyZH ?? "");

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function applyErrors(data: { details?: string[]; error?: unknown }) {
    if (data.details) {
      setErrors(data.details);
    } else if (
      data.error &&
      typeof data.error === "object" &&
      "fieldErrors" in data.error
    ) {
      const fe = (data.error as { fieldErrors: Record<string, string[]> }).fieldErrors;
      setErrors(Object.values(fe).flat());
    } else {
      setErrors([typeof data.error === "string" ? data.error : "Save failed"]);
    }
  }

  async function handleSave() {
    setSaving(true);
    setErrors([]);
    try {
      const url = isNew
        ? `${ADMIN_API_BASE}/lessons`
        : `${ADMIN_API_BASE}/lessons/${lesson!.id}`;
      const method = isNew ? "POST" : "PUT";
      const payload = isNew
        ? { course, moduleId, slug, titleEN, titleZH, order, estMinutes, certLevel, access, bodyEN, bodyZH }
        : { titleEN, titleZH, order, estMinutes, certLevel, access, bodyEN, bodyZH };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        applyErrors(await res.json());
        return;
      }
      if (isNew) {
        // Redirect to the edit page so the admin can upload a video next.
        const created = (await res.json()) as { id: string };
        router.push(`${ADMIN_BASE}/lessons/${created.id}`);
      } else {
        router.push(`${ADMIN_BASE}/lessons`);
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>{isNew ? "New lesson" : "Edit lesson"}</h1>
        {!isNew && <span className="admin-readonly-badge">{lesson!.lessonId}</span>}
      </div>

      {errors.length > 0 && (
        <ul className="admin-errors">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      <div className="admin-form">
        {/* Identity: editable on create, read-only when editing */}
        {isNew ? (
          <>
            <div className="admin-form-row">
              <label>Course</label>
              <select value={course} onChange={(e) => setCourse(e.target.value)}>
                <option value="basic">basic</option>
                <option value="advanced">advanced</option>
              </select>
            </div>
            <div className="admin-form-row">
              <label>Module</label>
              <select value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
                {MODULE_IDS.map((id) => <option key={id}>{id}</option>)}
              </select>
            </div>
            <div className="admin-form-row">
              <label>Slug</label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="kebab-case-slug"
              />
            </div>
            <div className="admin-form-row">
              <label>Lesson ID</label>
              <span className="admin-readonly">{course}/{moduleId}/{slug || "…"}</span>
            </div>
          </>
        ) : (
          <div className="admin-form-row">
            <label>Course / Module / Slug</label>
            <span className="admin-readonly">{lesson!.course} / {lesson!.moduleId} / {lesson!.slug}</span>
          </div>
        )}

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

        {/* Video upload needs an existing lesson id, so it only appears when editing. */}
        {!isNew && (
          <VideoUpload lessonId={lesson!.id} videoUid={lesson!.videoUid} videoStatus={lesson!.videoStatus} />
        )}

        {/* MDX bodies — D2/D3 note */}
        <p className="admin-hint">
          Bodies are raw MDX (may be left empty for a video-only lesson). Checkpoints use{" "}
          <code>{'<Checkpoint questionId="air-law-0001" />'}</code>.
          EN and ZH must reference the same set of questionIds.
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
          {saving ? "Saving…" : isNew ? "Create" : "Save"}
        </button>
      </div>
    </div>
  );
}
