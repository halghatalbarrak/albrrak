"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { arNum, formatAyah, count, linesPerDay } from "@/lib/format";
import { Button, Badge, Table, Input, ui, sp, type Column } from "@/components/ui";

// لوحة «المسارات المُجهَّزة» (البند ٢) — مكوّنٌ قابلٌ للإدماج بلا AppShell، لتُعرَض داخل
// صفحة برنامج مراقي (تبويب). نفس المنطق والـAPI القائمين (/api/admin/tracks, unitsForTrack…)
// بلا مساس: قائمة المسارات الثمانية + تفعيل/تعطيل + عرض وحدات مسارٍ بحدودها. عرضٌ فقط.

interface Track { id: string; nameAr: string; linesPerDay: number; ordinal: number; isActive: boolean; unitCount: number; tarseekhUnits: number; reviewDaysPerWeek: number }
interface Unit { unitNo: number; startSurah: number; startAyah: number; endSurah: number; endAyah: number }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export function PreparedTracksPanel() {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Track | null>(null);
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [edit, setEdit] = useState<Record<string, { t: string; r: string }>>({});

  const load = useCallback(async () => {
    const t = await token();
    if (!t) { window.location.href = "/login"; return; }
    const res = await fetch("/api/admin/tracks", { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) { setErr("لا صلاحية — المسارات للمدير."); return; }
    if (!res.ok) { setErr("تعذّر جلب المسارات."); return; }
    setTracks(((await res.json()) as { tracks: Track[] }).tracks);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function showUnits(tr: Track) {
    setOpen(tr); setUnits(null);
    const t = await token(); if (!t) return;
    const res = await fetch(`/api/admin/tracks?trackId=${encodeURIComponent(tr.id)}`, { headers: { authorization: `Bearer ${t}` } });
    if (res.ok) setUnits(((await res.json()) as { units: Unit[] }).units);
    else setErr("تعذّر جلب الوحدات.");
  }

  async function toggle(tr: Track) {
    const t = await token(); if (!t) return;
    const res = await fetch("/api/admin/tracks", {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ trackId: tr.id, isActive: !tr.isActive }),
    });
    if (res.ok) void load();
    else setErr("تعذّر تغيير الحالة.");
  }

  async function savePolicy(tr: Track) {
    const e = edit[tr.id] ?? { t: String(tr.tarseekhUnits), r: String(tr.reviewDaysPerWeek) };
    const tarseekhUnits = Number(e.t), reviewDaysPerWeek = Number(e.r);
    const t = await token(); if (!t) return;
    const res = await fetch("/api/admin/tracks", {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ trackId: tr.id, tarseekhUnits, reviewDaysPerWeek }),
    });
    if (res.ok) { setEdit((p) => { const n = { ...p }; delete n[tr.id]; return n; }); void load(); }
    else { const j = (await res.json()) as { error?: string }; setErr(j.error ?? "تعذّر حفظ المنهج."); }
  }
  const field = (tr: Track, k: "t" | "r") => edit[tr.id]?.[k] ?? String(k === "t" ? tr.tarseekhUnits : tr.reviewDaysPerWeek);
  const setField = (tr: Track, k: "t" | "r", v: string) =>
    setEdit((p) => ({ ...p, [tr.id]: { t: p[tr.id]?.t ?? String(tr.tarseekhUnits), r: p[tr.id]?.r ?? String(tr.reviewDaysPerWeek), [k]: v } }));

  const trackCols: Column<Track>[] = [
    { key: "nameAr", header: "المسار", cell: (t) => <strong>{t.nameAr}</strong> },
    { key: "linesPerDay", header: "المقدار (سطر/يوم)", cell: (t) => arNum(t.linesPerDay) },
    { key: "unitCount", header: "عدد الوحدات", cell: (t) => arNum(t.unitCount) },
    {
      key: "tarseekhUnits", header: "وحدات الترسيخ",
      cell: (t) => <Input inputMode="numeric" value={field(t, "t")} onChange={(e) => setField(t, "t", e.target.value)} style={{ width: 64 }} aria-label="وحدات الترسيخ" />,
    },
    {
      key: "reviewDaysPerWeek", header: "أيّام المراجعة",
      cell: (t) => <Input inputMode="numeric" value={field(t, "r")} onChange={(e) => setField(t, "r", e.target.value)} style={{ width: 64 }} aria-label="أيّام المراجعة" />,
    },
    { key: "isActive", header: "الحالة", cell: (t) => <Badge tone={t.isActive ? "success" : "neutral"}>{t.isActive ? "مفعّل" : "معطّل"}</Badge> },
    {
      key: "id", header: "", cell: (t) => (
        <span style={{ display: "flex", gap: sp(2), justifyContent: "flex-end" }}>
          <Button size="sm" type="button" disabled={!edit[t.id]} onClick={() => void savePolicy(t)}>حفظ</Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => void showUnits(t)}>الوحدات</Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => void toggle(t)}>{t.isActive ? "تعطيل" : "تفعيل"}</Button>
        </span>
      ),
    },
  ];

  const unitCols: Column<Unit>[] = [
    { key: "unitNo", header: "الوحدة", cell: (u) => arNum(u.unitNo) },
    { key: "startSurah", header: "من", cell: (u) => formatAyah(u.startSurah, u.startAyah) },
    { key: "endSurah", header: "إلى", cell: (u) => formatAyah(u.endSurah, u.endAyah) },
  ];

  return (
    <>
      {err && <p style={{ color: ui.color.danger }}>{err}</p>}

      {!open && tracks && (
        <>
          <p style={{ color: ui.color.muted, fontSize: ui.text.xs, marginBottom: sp(3) }}>
            كل مسارٍ مقسّمٌ مسبقًا إلى وحداتٍ بمقداره (اتّجاه مراقي: الفاتحة ثمّ الناس نزولاً). اضغط «الوحدات» لعرض حدودها.
          </p>
          <Table columns={trackCols} rows={tracks} />
        </>
      )}

      {open && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: sp(3), marginBottom: sp(3), flexWrap: "wrap" }}>
            <Button size="sm" variant="ghost" type="button" onClick={() => { setOpen(null); setUnits(null); }}>◀ المسارات</Button>
            <strong>{open.nameAr}</strong>
            <span style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{linesPerDay(open.linesPerDay)} · {count(open.unitCount, "وحدة", "وحدتان", "وحدات", "وحدة")}</span>
          </div>
          {units ? <Table columns={unitCols} rows={units} /> : <p style={{ color: ui.color.muted }}>…جارٍ تحميل الوحدات</p>}
        </>
      )}

      {!tracks && !err && <p style={{ color: ui.color.muted }}>…جارٍ التحميل</p>}
    </>
  );
}
