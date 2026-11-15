"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, sp, ui } from "@/components/ui";
import { tUnified as tu } from "@/i18n/ar/unified";
import { token } from "./_types";
import type { PostFn, TrackOption } from "./_types";

export function TrackAssignInline({ studentId, post }: { studentId: string; post: PostFn }) {
  const [tracks, setTracks] = useState<TrackOption[]>([]);
  const [suggestedId, setSuggestedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    void (async () => {
      const t = await token();
      const res = await fetch(`/api/students/${studentId}/track-suggestion`, { headers: t ? { authorization: `Bearer ${t}` } : {} });
      if (res.ok) {
        const j = (await res.json()) as { suggestedTrackId: string | null; availableTracks: TrackOption[] };
        setTracks(j.availableTracks);
        setSuggestedId(j.suggestedTrackId);
        setSelectedId(j.suggestedTrackId ?? j.availableTracks[0]?.id ?? "");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, studentId]);

  const save = () => {
    if (!selectedId) return;
    void post(`/api/students/${studentId}/assign-track`, { trackId: selectedId, ...(note.trim() ? { note: note.trim() } : {}) }, tu("trackAssigned"));
    setOpen(false);
  };

  const row: React.CSSProperties = { display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" };
  if (!open) {
    return (
      <div style={row}>
        <p style={{ color: ui.color.muted, margin: 0, fontSize: ui.text.xs }}>{tu("trackNotSet")}</p>
        <Button size="sm" variant="primary" onClick={() => setOpen(true)}>{tu("assignTrackTitle")}</Button>
      </div>
    );
  }

  const isBelowSuggested = suggestedId && tracks.find((t) => t.id === suggestedId)
    ? (tracks.find((t) => t.id === selectedId)?.ordinal ?? 0) < (tracks.find((t) => t.id === suggestedId)!.ordinal)
    : false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
      <p style={{ color: ui.color.muted, margin: 0, fontSize: ui.text.xs }}>{tu("trackNotSet")}</p>
      {tracks.length > 0 && (
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
          style={{ fontFamily: ui.font, padding: `${sp(1)} ${sp(2)}`, borderRadius: ui.radius.sm, border: `1px solid ${ui.color.border}`, background: ui.color.surface, color: ui.color.text, direction: "rtl" }}>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>{t.nameAr}{t.id === suggestedId ? ` (${tu("suggestedTrack")})` : ""}</option>
          ))}
        </select>
      )}
      {isBelowSuggested && <Input placeholder={tu("noteRequired")} value={note} onChange={(e) => setNote(e.target.value)} />}
      {!isBelowSuggested && <Input placeholder={tu("noteOptional")} value={note} onChange={(e) => setNote(e.target.value)} />}
      <div style={{ display: "flex", gap: sp(2) }}>
        <Button size="sm" variant="primary" onClick={save} disabled={!selectedId || (isBelowSuggested && !note.trim())}>{tu("saveTrack")}</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{tu("cancelBtn")}</Button>
      </div>
    </div>
  );
}
