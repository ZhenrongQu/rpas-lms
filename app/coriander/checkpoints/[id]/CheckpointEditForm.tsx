"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MODULE_IDS } from "@/lib/content/types";
import { ADMIN_BASE, ADMIN_API_BASE } from "@/lib/admin/route";

type OptionRow = { optionId: string; labelEN: string; labelZH: string; isCorrect: boolean };

type CheckpointRow = {
  id: string;
  lessonId: string;
  course: string;
  moduleId: string;
  order: number;
  type: string;
  selectCount: number;
  status: string;
  stemEN: string;
  stemZH: string;
  explEN: string;
  explZH: string;
  refEN: string;
  refZH: string;
  tags: string;
  options: OptionRow[];
};

type LessonOption = { lessonId: string; course: string; moduleId: string; title: string };

type Props = { checkpoint: CheckpointRow | null; lessons: LessonOption[] };

const DEFAULT_OPTIONS: OptionRow[] = [
  { optionId: "a", labelEN: "", labelZH: "", isCorrect: false },
  { optionId: "b", labelEN: "", labelZH: "", isCorrect: false },
  { optionId: "c", labelEN: "", labelZH: "", isCorrect: false },
  { optionId: "d", labelEN: "", labelZH: "", isCorrect: false },
];

export default function CheckpointEditForm({ checkpoint, lessons }: Props) {
  const router = useRouter();
  const isNew = checkpoint === null;

  const [course, setCourse] = useState<"basic" | "advanced">(
    (checkpoint?.course as "basic" | "advanced") ?? "basic",
  );
  const [moduleId, setModuleId] = useState(checkpoint?.moduleId ?? "air-law");
  const [lessonId, setLessonId] = useState(checkpoint?.lessonId ?? "");
  const [order, setOrder] = useState(checkpoint?.order ?? 0);
  const [type, setType] = useState(checkpoint?.type ?? "SINGLE");
  const [selectCount, setSelectCount] = useState(checkpoint?.selectCount ?? 1);
  const [stemEN, setStemEN] = useState(checkpoint?.stemEN ?? "");
  const [stemZH, setStemZH] = useState(checkpoint?.stemZH ?? "");
  const [explEN, setExplEN] = useState(checkpoint?.explEN ?? "");
  const [explZH, setExplZH] = useState(checkpoint?.explZH ?? "");
  const [refEN, setRefEN] = useState(checkpoint?.refEN ?? "");
  const [refZH, setRefZH] = useState(checkpoint?.refZH ?? "");
  const [tags, setTags] = useState(() =>
    checkpoint ? (JSON.parse(checkpoint.tags) as string[]).join(", ") : "",
  );
  const [options, setOptions] = useState<OptionRow[]>(
    checkpoint?.options.length ? checkpoint.options : DEFAULT_OPTIONS,
  );

  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Lessons available for the chosen course + module (cascading picker).
  const lessonChoices = useMemo(
    () => lessons.filter((l) => l.course === course && l.moduleId === moduleId),
    [lessons, course, moduleId],
  );

  function pickCourse(next: "basic" | "advanced") {
    setCourse(next);
    setLessonId(""); // force re-pick: a lesson belongs to one course/module
  }
  function pickModule(next: string) {
    setModuleId(next);
    setLessonId("");
  }

  function updateOption(index: number, field: keyof OptionRow, value: string | boolean) {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, [field]: value } : o)));
  }

  function toggleCorrect(index: number) {
    if (type === "SINGLE") {
      setOptions((prev) => prev.map((o, i) => ({ ...o, isCorrect: i === index })));
    } else {
      updateOption(index, "isCorrect", !options[index].isCorrect);
    }
  }

  function buildPayload() {
    return {
      course,
      moduleId,
      lessonId,
      order: Number(order),
      type,
      selectCount: Number(selectCount),
      stemEN,
      stemZH,
      explEN,
      explZH,
      refEN,
      refZH,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      options,
    };
  }

  async function handleSave() {
    if (!lessonId) {
      setErrors(["Pick a lesson to assign this checkpoint to."]);
      return;
    }
    setSaving(true);
    setErrors([]);
    try {
      const url = isNew
        ? `${ADMIN_API_BASE}/checkpoints`
        : `${ADMIN_API_BASE}/checkpoints/${checkpoint!.id}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const data = await res.json();
        setErrors(
          data.error?.fieldErrors
            ? Object.values(data.error.fieldErrors as Record<string, string[]>).flat()
            : data.error?.formErrors ?? [data.error ?? "Save failed"],
        );
        return;
      }
      router.push(`${ADMIN_BASE}/checkpoints`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!checkpoint) return;
    if (!confirm(`Archive checkpoint ${checkpoint.id}?`)) return;
    setArchiving(true);
    setErrors([]);
    try {
      const res = await fetch(`${ADMIN_API_BASE}/checkpoints/${checkpoint.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setErrors([data.error ?? "Archive failed"]);
        return;
      }
      router.push(`${ADMIN_BASE}/checkpoints`);
      router.refresh();
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>{isNew ? "New checkpoint" : `Edit ${checkpoint!.id}`}</h1>
        {!isNew && checkpoint!.status === "ACTIVE" && (
          <button onClick={handleArchive} disabled={archiving} className="btn-danger">
            {archiving ? "Archiving…" : "Archive"}
          </button>
        )}
      </div>

      {errors.length > 0 && (
        <ul className="admin-errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      <div className="admin-form">
        {/* Assignment: course → module → lesson */}
        <div className="admin-form-row">
          <label>Course</label>
          <select value={course} onChange={(e) => pickCourse(e.target.value as "basic" | "advanced")}>
            <option value="basic">Basic</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
        <div className="admin-form-row">
          <label>Module</label>
          <select value={moduleId} onChange={(e) => pickModule(e.target.value)}>
            {MODULE_IDS.map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </div>
        <div className="admin-form-row">
          <label>Lesson (chapter)</label>
          <select value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
            <option value="">— pick a lesson —</option>
            {lessonChoices.map((l) => (
              <option key={l.lessonId} value={l.lessonId}>
                {l.title} ({l.lessonId})
              </option>
            ))}
          </select>
        </div>
        <div className="admin-form-row">
          <label>Order (bottom of lesson)</label>
          <input type="number" min={0} value={order} onChange={(e) => setOrder(Number(e.target.value))} />
        </div>

        {/* Question type */}
        <div className="admin-form-row">
          <label>Type</label>
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              if (e.target.value === "SINGLE") setSelectCount(1);
            }}
          >
            <option>SINGLE</option>
            <option>MULTI</option>
          </select>
        </div>
        {type === "MULTI" && (
          <div className="admin-form-row">
            <label>Select count</label>
            <input
              type="number"
              min={2}
              value={selectCount}
              onChange={(e) => setSelectCount(Number(e.target.value))}
            />
          </div>
        )}
        <div className="admin-form-row">
          <label>Tags</label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma-separated" />
        </div>

        {/* Stems */}
        <div className="admin-form-row">
          <label>Stem EN</label>
          <textarea value={stemEN} onChange={(e) => setStemEN(e.target.value)} rows={3} />
        </div>
        <div className="admin-form-row">
          <label>Stem ZH</label>
          <textarea value={stemZH} onChange={(e) => setStemZH(e.target.value)} rows={3} />
        </div>

        {/* Options */}
        <fieldset className="admin-options">
          <legend>
            Options {type === "SINGLE" ? "(click to set correct)" : `(select ${selectCount} correct)`}
          </legend>
          {options.map((opt, i) => (
            <div key={opt.optionId} className="admin-option" data-correct={opt.isCorrect || undefined}>
              <button
                type="button"
                className={`admin-option-correct ${opt.isCorrect ? "is-correct" : ""}`}
                onClick={() => toggleCorrect(i)}
                title="Toggle correct"
              >
                {opt.optionId.toUpperCase()}
              </button>
              <input placeholder="EN" value={opt.labelEN} onChange={(e) => updateOption(i, "labelEN", e.target.value)} />
              <input placeholder="ZH" value={opt.labelZH} onChange={(e) => updateOption(i, "labelZH", e.target.value)} />
            </div>
          ))}
        </fieldset>

        {/* Explanations / references */}
        <div className="admin-form-row">
          <label>Explanation EN</label>
          <textarea value={explEN} onChange={(e) => setExplEN(e.target.value)} rows={3} />
        </div>
        <div className="admin-form-row">
          <label>Explanation ZH</label>
          <textarea value={explZH} onChange={(e) => setExplZH(e.target.value)} rows={3} />
        </div>
        <div className="admin-form-row">
          <label>Reference EN</label>
          <input value={refEN} onChange={(e) => setRefEN(e.target.value)} />
        </div>
        <div className="admin-form-row">
          <label>Reference ZH</label>
          <input value={refZH} onChange={(e) => setRefZH(e.target.value)} />
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? "Saving…" : isNew ? "Create" : "Save"}
        </button>
      </div>
    </div>
  );
}
