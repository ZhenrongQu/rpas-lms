"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MODULE_IDS } from "@/lib/content/types";

type OptionRow = {
  optionId: string;
  labelEN: string;
  labelZH: string;
  isCorrect: boolean;
};

type QuestionRow = {
  id: string;
  moduleId: string;
  certLevel: string;
  type: string;
  selectCount: number;
  difficulty: number;
  status: string;
  stemEN: string;
  stemZH: string;
  explEN: string;
  explZH: string;
  refEN: string;
  refZH: string;
  tags: string;
  mediaKind: string | null;
  mediaUrl: string | null;
  mediaAltEN: string | null;
  mediaAltZH: string | null;
  options: OptionRow[];
};

type Props = {
  locale: string;
  question: QuestionRow | null;
};

const DEFAULT_OPTIONS: OptionRow[] = [
  { optionId: "a", labelEN: "", labelZH: "", isCorrect: false },
  { optionId: "b", labelEN: "", labelZH: "", isCorrect: false },
  { optionId: "c", labelEN: "", labelZH: "", isCorrect: false },
  { optionId: "d", labelEN: "", labelZH: "", isCorrect: false },
];

export default function QuestionEditForm({ locale, question }: Props) {
  const router = useRouter();
  const isNew = question === null;

  const [moduleId, setModuleId] = useState(question?.moduleId ?? "air-law");
  const [certLevel, setCertLevel] = useState(question?.certLevel ?? "BASIC");
  const [type, setType] = useState(question?.type ?? "SINGLE");
  const [selectCount, setSelectCount] = useState(question?.selectCount ?? 1);
  const [difficulty, setDifficulty] = useState(question?.difficulty ?? 1);
  const [stemEN, setStemEN] = useState(question?.stemEN ?? "");
  const [stemZH, setStemZH] = useState(question?.stemZH ?? "");
  const [explEN, setExplEN] = useState(question?.explEN ?? "");
  const [explZH, setExplZH] = useState(question?.explZH ?? "");
  const [refEN, setRefEN] = useState(question?.refEN ?? "");
  const [refZH, setRefZH] = useState(question?.refZH ?? "");
  const [tags, setTags] = useState(() =>
    question ? (JSON.parse(question.tags) as string[]).join(", ") : "",
  );
  const [options, setOptions] = useState<OptionRow[]>(
    question?.options.length ? question.options : DEFAULT_OPTIONS,
  );

  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

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
      moduleId,
      certLevel,
      type,
      selectCount: Number(selectCount),
      difficulty: Number(difficulty),
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
    setSaving(true);
    setErrors([]);
    try {
      const url = isNew
        ? "/api/admin/questions"
        : `/api/admin/questions/${question!.id}`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const data = await res.json();
        setErrors(
          data.error?.fieldErrors
            ? Object.values(data.error.fieldErrors as Record<string, string[]>).flat()
            : [data.error ?? "Save failed"],
        );
        return;
      }
      router.push(`/${locale}/admin/questions`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!question) return;
    if (!confirm(`Archive question ${question.id}? This cannot be undone if lessons reference it.`)) return;
    setArchiving(true);
    setErrors([]);
    try {
      const res = await fetch(`/api/admin/questions/${question.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setErrors([data.error ?? "Archive failed"]);
        return;
      }
      router.push(`/${locale}/admin/questions`);
      router.refresh();
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>{isNew ? "New question" : `Edit ${question!.id}`}</h1>
        {!isNew && question!.status === "ACTIVE" && (
          <button
            onClick={handleArchive}
            disabled={archiving}
            className="btn-danger"
          >
            {archiving ? "Archiving…" : "Archive"}
          </button>
        )}
      </div>

      {errors.length > 0 && (
        <ul className="admin-errors">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      <div className="admin-form">
        {/* Metadata row */}
        <div className="admin-form-row">
          <label>Module</label>
          <select value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
            {MODULE_IDS.map((id) => <option key={id}>{id}</option>)}
          </select>
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
          <label>Difficulty</label>
          <select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
            <option value={0}>D0 — intro</option>
            <option value={1}>D1 — standard</option>
            <option value={2}>D2 — hard</option>
            <option value={3}>D3 — expert</option>
          </select>
        </div>
        <div className="admin-form-row">
          <label>Tags</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="comma-separated"
          />
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
          <legend>Options {type === "SINGLE" ? "(click to set correct)" : `(select ${selectCount} correct)`}</legend>
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
              <input
                placeholder="EN"
                value={opt.labelEN}
                onChange={(e) => updateOption(i, "labelEN", e.target.value)}
              />
              <input
                placeholder="ZH"
                value={opt.labelZH}
                onChange={(e) => updateOption(i, "labelZH", e.target.value)}
              />
            </div>
          ))}
        </fieldset>

        {/* Explanations */}
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
