"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_API_BASE } from "@/lib/admin/route";

type Props = {
  lessonId: string;
  videoUid: string | null;
  videoStatus: string | null;
};

export default function VideoUpload({ lessonId, videoUid, videoStatus }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const urlRes = await fetch(`${ADMIN_API_BASE}/lessons/${lessonId}/video/upload-url`, { method: "POST" });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, uid } = await urlRes.json();

      const form = new FormData();
      form.append("file", file);
      const upRes = await fetch(uploadURL, { method: "POST", body: form });
      if (!upRes.ok) throw new Error("Upload to Cloudflare failed");

      const saveRes = await fetch(`${ADMIN_API_BASE}/lessons/${lessonId}/video`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUid: uid }),
      });
      if (!saveRes.ok) throw new Error("Failed to save video");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${ADMIN_API_BASE}/lessons/${lessonId}/video`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove video");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-form-row">
      <label>Video</label>
      <div>
        {videoUid ? (
          <p className="admin-readonly">
            {videoUid} — {videoStatus ?? "PROCESSING"}{" "}
            <button type="button" onClick={handleRemove} disabled={busy}>Remove</button>
          </p>
        ) : (
          <input
            type="file"
            accept="video/mp4,video/*"
            disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
          />
        )}
        {busy && <p className="admin-hint">Working… (single file ≤ 200MB)</p>}
        {error && <p className="admin-errors">{error}</p>}
      </div>
    </div>
  );
}
