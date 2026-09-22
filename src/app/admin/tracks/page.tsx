"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Button, Badge, Table, ui, sp, type Column } from "@/components/ui";

// شاشة إدارة المسارات المُجهَّزة (البند ٢): المسارات الثمانية بمقدارها وعدد وحداتها، وتفعيلها/
// تعطيلها، وعرض وحدات مسارٍ (unitNo + الحدود سورة:آية). عرضٌ وإدارةٌ خفيفة — لا حساب لحظيّ.

interface Track { id: string; nameAr: string; linesPerDay: number; ordinal: number; isActive: boolean; unitCount: number }
interface Unit { unitNo: number; startSurah: number; startAyah: number; endSurah: number; endAyah: number }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const CRUMBS = [{ label: "الرئيسة", href: "/" }, { label: "المسارات المُجهَّزة" }];

export default function AdminTracksPage() {
  const { me } = useMe();
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Track | null>(null);
  const [units, setUnits] = useState<Unit[] | null>(null);

  const load = useCallback(async () => {
    const t = await token();
    if (!t) { window.location.href = "/login"; return; }
    const res = await fetch("/api/admin/tracks", { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) { setErr("لا صلاحية — هذه الشاشة للمدير."); return; }
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

  const trackCols: Column<Track>[] = [
    { key: "nameAr", header: "المسار", cell: (t) => <strong>{t.nameAr}</strong> },
    { key: "linesPerDay", header: "المقدار (سطر/يوم)", cell: (t) => String(t.linesPerDay) },
    { key: "unitCount", header: "عدد الوحدات", cell: (t) => String(t.unitCount) },
    { key: "isActive", header: "الحالة", cell: (t) => <Badge tone={t.isActive ? "success" : "neutral"}>{t.isActive ? "مفعّل" : "معطّل"}</Badge> },
    {
      key: "id", header: "", cell: (t) => (
        <span style={{ display: "flex", gap: sp(2), justifyContent: "flex-end" }}>
          <Button size="sm" variant="ghost" type="button" onClick={() => void showUnits(t)}>الوحدات</Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => void toggle(t)}>{t.isActive ? "تعطيل" : "تفعيل"}</Button>
        </span>
      ),
    },
  ];

  const unitCols: Column<Unit>[] = [
    { key: "unitNo", header: "الوحدة", cell: (u) => String(u.unitNo) },
    { key: "startSurah", header: "من", cell: (u) => `${u.startSurah}:${u.startAyah}` },
    { key: "endSurah", header: "إلى", cell: (u) => `${u.endSurah}:${u.endAyah}` },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/tracks" title="المسارات المُجهَّزة" crumbs={CRUMBS}>
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
            <span style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{open.linesPerDay} سطر/يوم · {open.unitCount} وحدة</span>
          </div>
          {units ? <Table columns={unitCols} rows={units} /> : <p style={{ color: ui.color.muted }}>…جارٍ تحميل الوحدات</p>}
        </>
      )}

      {!tracks && !err && <p style={{ color: ui.color.muted }}>…جارٍ التحميل</p>}
    </AppShell>
  );
}
