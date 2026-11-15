"use client";

import { useState } from "react";
import { Button, sp, ui } from "@/components/ui";
import { tUnified as tu } from "@/i18n/ar/unified";
import { token } from "./_types";
import type { Student } from "./_types";

export function AutoAssignMissingBtn({ students, circleId, onDone }: { students: Student[] | null; circleId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  if (!students) return null;
  const count = students.filter((s) => s.program === "MARAQI" && s.today?.newHifz?.kind === "NO_TRACK").length;
  if (count === 0) return null;

  const run = async () => {
    setBusy(true); setResult(null);
    const t = await token(); if (!t) { setBusy(false); return; }
    const res = await fetch(`/api/circles/${circleId}/auto-assign-missing-tracks`, { method: "POST", headers: { authorization: `Bearer ${t}` } });
    setBusy(false);
    if (res.ok) {
      const j = (await res.json()) as { assigned: number; failed: number };
      setResult(`${tu("autoAssignDone")} ${j.assigned}`);
      onDone();
    }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: sp(2), marginBottom: sp(2) }}>
      <Button size="sm" variant="bronze" disabled={busy} onClick={() => void run()}>
        {busy ? tu("autoAssignProgress") : `${tu("autoAssignMissingBtn")} (${count})`}
      </Button>
      {result && <span style={{ fontSize: ui.text.xs, color: ui.color.success }}>{result}</span>}
    </div>
  );
}
