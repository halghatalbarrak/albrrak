"use client";

import { use, useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Select, Field, ui, sp } from "@/components/ui";

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
    if (res.status === 403) { setErr("لا صلاحية — إعدادات البرامج للمشرف/المدير."); return; }
    if (!res.ok) { setErr("تعذّر جلب الإعدادات."); return; }
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
    if (res.ok) { setMsg("حُفظت الإعدادات."); await load(); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "تعذّر الحفظ."); }
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/programs"
      title={`إعدادات: ${d?.program.nameAr ?? ""}`}
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "إعدادات البرنامج" }]}>{children}</AppShell>
  );

  if (err && !d) return <Shell><p style={{ color: ui.color.danger }}>{err}</p></Shell>;
  if (!d) return <Shell><p style={{ color: ui.color.muted }}>جارٍ التحميل…</p></Shell>;

  const nextChanged = nextId !== (d.program.nextProgramId ?? "");

  return (
    <Shell>
      <Card style={{ maxWidth: 560 }}>
        {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}
        {err && <p style={{ color: ui.color.danger, fontSize: ui.text.xs }}>{err}</p>}
        <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginTop: 0 }}>
          عند تخرّج طالبٍ من هذا البرنامج ينتقل تلقائيًّا (اليوم التالي) إلى البرنامج التالي بالمسار الافتراضيّ. بلا إعدادٍ ⟵ لا انتقال، وتنبيهٌ للمشرف.
        </p>
        <Field label="البرنامج التالي (عند التخرّج)">
          <Select value={nextId} onChange={(e) => { setNextId(e.target.value); setTrackId(""); }}>
            <option value="">— لا انتقال —</option>
            {d.programs.filter((p) => p.id !== d.program.id).map((p) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}
          </Select>
        </Field>
        <Field label="المسار الافتراضيّ للمنتقلين (يبدؤون من الفاتحة به)">
          {nextChanged ? (
            <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: 0 }}>احفظ البرنامج التالي أولًا، ثمّ اختر مساره.</p>
          ) : (
            <Select value={trackId} onChange={(e) => setTrackId(e.target.value)} disabled={!nextId}>
              <option value="">— بلا مسار —</option>
              {d.tracks.map((tr) => <option key={tr.id} value={tr.id}>{tr.nameAr}</option>)}
            </Select>
          )}
        </Field>
        <Button onClick={() => void save()} style={{ marginTop: sp(2) }}>حفظ الإعدادات</Button>
      </Card>
    </Shell>
  );
}
