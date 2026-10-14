"use client";

import { use, useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Select, Field, ui, sp } from "@/components/ui";
import { tPrograms } from "@/i18n/ar/programs";

interface Data {
  program: { id: string; key: string; nameAr: string; nextProgramId: string | null; defaultTrackForIncomingId: string | null };
  programs: { id: string; key: string; nameAr: string }[];
  tracks: { id: string; nameAr: string }[];
}
async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

// إعدادات انتقال البرنامج (ق٤/ق٥): البرنامج التالي + المسار الافتراضيّ للمنتقلين إليه.
export default function ProgramSettingsPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const { me } = useMe();
  const [d, setD] = useState<Data | null>(null);
  const [nextId, setNextId] = useState("");
  const [trackId, setTrackId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = await token(); if (!t) { window.location.href = "/login"; return; }
    const res = await fetch(`/api/admin/programs/${key}`, { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) { setErr(tPrograms("errForbidden")); return; }
    if (!res.ok) { setErr(tPrograms("errLoadSettings")); return; }
    const data = (await res.json()) as Data;
    setD(data); setNextId(data.program.nextProgramId ?? ""); setTrackId(data.program.defaultTrackForIncomingId ?? ""); setErr(null);
  }, [key]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    setMsg(null); setErr(null);
    const t = await token(); if (!t) return;
    const res = await fetch(`/api/admin/programs/${key}`, {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ nextProgramId: nextId || null, defaultTrackForIncomingId: trackId || null }),
    });
    if (res.ok) { setMsg(tPrograms("okSaved")); await load(); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? tPrograms("errSave")); }
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/programs"
      title={`${tPrograms("titlePrefix")}${d?.program.nameAr ?? ""}`}
      crumbs={[{ label: tPrograms("crumbHome"), href: "/" }, { label: tPrograms("crumbAdmin") }, { label: tPrograms("crumbProgramSettings") }]}>{children}</AppShell>
  );

  if (err && !d) return <Shell><p style={{ color: ui.color.danger }}>{err}</p></Shell>;
  if (!d) return <Shell><p style={{ color: ui.color.muted }}>{tPrograms("loading")}</p></Shell>;

  const nextChanged = nextId !== (d.program.nextProgramId ?? "");

  return (
    <Shell>
      <Card style={{ maxWidth: 560 }}>
        {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}
        {err && <p style={{ color: ui.color.danger, fontSize: ui.text.xs }}>{err}</p>}
        <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginTop: 0 }}>
          {tPrograms("intro")}
        </p>
        <Field label={tPrograms("fieldNextProgram")}>
          <Select value={nextId} onChange={(e) => { setNextId(e.target.value); setTrackId(""); }}>
            <option value="">{tPrograms("optionNoTransition")}</option>
            {d.programs.filter((p) => p.id !== d.program.id).map((p) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}
          </Select>
        </Field>
        <Field label={tPrograms("fieldDefaultTrack")}>
          {nextChanged ? (
            <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: 0 }}>{tPrograms("saveNextFirst")}</p>
          ) : (
            <Select value={trackId} onChange={(e) => setTrackId(e.target.value)} disabled={!nextId}>
              <option value="">{tPrograms("optionNoTrack")}</option>
              {d.tracks.map((tr) => <option key={tr.id} value={tr.id}>{tr.nameAr}</option>)}
            </Select>
          )}
        </Field>
        <Button onClick={() => void save()} style={{ marginTop: sp(2) }}>{tPrograms("saveBtn")}</Button>
      </Card>
    </Shell>
  );
}
