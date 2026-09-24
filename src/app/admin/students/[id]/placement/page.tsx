"use client";

import { use, useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Input, Select, Field, Badge, ui, sp } from "@/components/ui";

interface Range { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }
interface View {
  studentName: string;
  programKey: "QAIDAH_MADANIYYAH" | "MARAQI" | "WEEKLY" | null;
  pending: { programKey: string; from: string } | null;
  programs: { id: string; key: string; nameAr: string }[];
  qaidah: { currentLessonId: string | null; lessons: { id: string; nameAr: string; chapterName: string | null }[] } | null;
  maraqi: { reachedSurah: number | null; reachedAyah: number | null; outOfOrder: Range[] } | null;
}

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}
const PROG_AR: Record<string, string> = { QAIDAH_MADANIYYAH: "القاعدة المدنية", MARAQI: "مراقي", WEEKLY: "الأسبوعيّ" };

export default function StudentPlacementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useMe();
  const [v, setV] = useState<View | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = await token(); if (!t) { window.location.href = "/login"; return; }
    const res = await fetch(`/api/students/${id}/placement`, { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) { setErr("لا صلاحية — التسكين للمشرف/المدير (ق٧)."); return; }
    if (!res.ok) { setErr("تعذّر جلب بيانات التسكين."); return; }
    setV((await res.json()) as View); setErr(null);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>, ok: string) {
    setMsg(null); setErr(null);
    const t = await token(); if (!t) return;
    const res = await fetch(`/api/students/${id}/placement`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify(body),
    });
    if (res.ok) { setMsg(ok); await load(); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "تعذّر التنفيذ."); }
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/students"
      title={`تسكين: ${v?.studentName ?? ""}`}
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "الطلاب", href: "/admin/students" }, { label: "تسكين" }]}>{children}</AppShell>
  );

  if (err && !v) return <Shell><p style={{ color: ui.color.danger }}>{err}</p></Shell>;
  if (!v) return <Shell><p style={{ color: ui.color.muted }}>جارٍ التحميل…</p></Shell>;

  return (
    <Shell>
      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}
      {err && <p style={{ color: ui.color.danger, fontSize: ui.text.xs }}>{err}</p>}

      {/* البرنامج الحاليّ + المعلّق + تغييره */}
      <ChangeProgram v={v} onSave={(programId) => post({ action: "change-program", programId }, "تغيّر البرنامج.")} />

      {/* التسكين بحسب البرنامج */}
      {v.programKey === "QAIDAH_MADANIYYAH" && v.qaidah && (
        <QaidahPlacement q={v.qaidah} onSave={(currentLessonId) => post({ action: "place-qaidah", currentLessonId }, "سُكِّن على القاعدة.")} />
      )}
      {v.programKey === "MARAQI" && v.maraqi && (
        <MaraqiPlacement m={v.maraqi} onSave={(p) => post({ action: "place-maraqi", ...p }, "سُكِّن على مراقي.")} />
      )}
    </Shell>
  );
}

function ChangeProgram({ v, onSave }: { v: View; onSave: (programId: string) => void }) {
  const current = v.programs.find((p) => p.key === v.programKey);
  const [sel, setSel] = useState(current?.id ?? "");
  useEffect(() => { setSel(current?.id ?? ""); }, [current?.id]);
  return (
    <Card style={{ marginBottom: sp(4) }}>
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginTop: 0 }}>البرنامج</h2>
      <div style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap" }}>
        <Badge tone="primary">{v.programKey ? PROG_AR[v.programKey] : "بلا برنامج"}</Badge>
        {v.pending && <Badge tone="bronze">ينتقل إلى {PROG_AR[v.pending.programKey]} في {v.pending.from}</Badge>}
      </div>
      <div style={{ display: "flex", gap: sp(2), marginTop: sp(3), flexWrap: "wrap" }}>
        <Select value={sel} onChange={(e) => setSel(e.target.value)} style={{ minWidth: 180 }}>
          {v.programs.map((p) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}
        </Select>
        <Button variant="bronze" size="sm" disabled={!sel || sel === current?.id} onClick={() => onSave(sel)}>تغيير البرنامج</Button>
      </div>
      {v.pending && <p style={{ fontSize: ui.text.xs, color: ui.color.muted, marginBottom: 0 }}>تغيير البرنامج الآن يُلغي الانتقال المعلّق.</p>}
    </Card>
  );
}

function QaidahPlacement({ q, onSave }: { q: NonNullable<View["qaidah"]>; onSave: (lessonId: string) => void }) {
  const [sel, setSel] = useState(q.currentLessonId ?? q.lessons[0]?.id ?? "");
  const idx = q.lessons.findIndex((l) => l.id === sel);
  return (
    <Card>
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginTop: 0 }}>تسكين القاعدة — الدرس الحاليّ</h2>
      <Field label="الدرس الحاليّ للطالب">
        <Select value={sel} onChange={(e) => setSel(e.target.value)}>
          {q.lessons.map((l) => <option key={l.id} value={l.id}>{l.chapterName ? `${l.chapterName} — ` : ""}{l.nameAr}</option>)}
        </Select>
      </Field>
      <p style={{ fontSize: ui.text.xs, color: ui.color.muted }}>
        ستُكمَّل <strong>{idx < 0 ? 0 : idx}</strong> درسًا قبله (تسكينًا، بلا نقاط)، ويبدأ من هذا الدرس.
      </p>
      <Button onClick={() => sel && onSave(sel)} disabled={!sel}>حفظ التسكين</Button>
    </Card>
  );
}

function MaraqiPlacement({ m, onSave }: { m: NonNullable<View["maraqi"]>; onSave: (p: { reachedSurah: number | null; reachedAyah: number | null; outOfOrder: Range[] }) => void }) {
  const [rs, setRs] = useState(m.reachedSurah?.toString() ?? "");
  const [ra, setRa] = useState(m.reachedAyah?.toString() ?? "");
  const [ooo, setOoo] = useState<Range[]>(m.outOfOrder);
  const [nr, setNr] = useState({ fromSurah: "", fromAyah: "", toSurah: "", toAyah: "" });

  const addRange = () => {
    const r = { fromSurah: +nr.fromSurah, fromAyah: +nr.fromAyah, toSurah: +nr.toSurah, toAyah: +nr.toAyah };
    if ([r.fromSurah, r.fromAyah, r.toSurah, r.toAyah].every((n) => Number.isFinite(n) && n > 0)) {
      setOoo([...ooo, r]); setNr({ fromSurah: "", fromAyah: "", toSurah: "", toAyah: "" });
    }
  };
  const num: React.CSSProperties = { width: 64 };

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: sp(3) }}>
      <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, margin: 0 }}>تسكين مراقي — تأشير المحفوظ</h2>

      <Field label="موضع الوصول بالترتيب (سورة:آية) — الجبهة المسكَّنة">
        <div style={{ display: "flex", gap: sp(2), alignItems: "center" }}>
          <Input style={num} type="number" placeholder="سورة" value={rs} onChange={(e) => setRs(e.target.value)} />:
          <Input style={num} type="number" placeholder="آية" value={ra} onChange={(e) => setRa(e.target.value)} />
        </div>
      </Field>

      <div>
        <div style={{ fontSize: ui.text.xs, fontWeight: 600, marginBottom: sp(1) }}>محفوظٌ خارج الترتيب (نطاقات)</div>
        {ooo.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: sp(2), alignItems: "center", fontSize: ui.text.xs, marginBottom: 4 }}>
            <span>{r.fromSurah}:{r.fromAyah} ← {r.toSurah}:{r.toAyah}</span>
            <Button variant="ghost" size="sm" onClick={() => setOoo(ooo.filter((_, j) => j !== i))}>حذف</Button>
          </div>
        ))}
        <div style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap", marginTop: sp(1) }}>
          <span style={{ fontSize: ui.text.xs }}>من</span>
          <Input style={num} type="number" value={nr.fromSurah} onChange={(e) => setNr({ ...nr, fromSurah: e.target.value })} />:
          <Input style={num} type="number" value={nr.fromAyah} onChange={(e) => setNr({ ...nr, fromAyah: e.target.value })} />
          <span style={{ fontSize: ui.text.xs }}>إلى</span>
          <Input style={num} type="number" value={nr.toSurah} onChange={(e) => setNr({ ...nr, toSurah: e.target.value })} />:
          <Input style={num} type="number" value={nr.toAyah} onChange={(e) => setNr({ ...nr, toAyah: e.target.value })} />
          <Button variant="ghost" size="sm" onClick={addRange}>+ نطاق</Button>
        </div>
      </div>

      {/* معاينة فوريّة */}
      <div style={{ background: ui.color.soft, borderRadius: ui.radius.md, padding: sp(3), fontSize: ui.text.xs }}>
        <div>الحفظ الجديد يبدأ بعد <strong>{rs || "—"}:{ra || "—"}</strong> بالترتيب، ويتخطّى المحفوظ خارج الترتيب حين يبلغه.</div>
        <div>المراجعة تشمل <strong>{ooo.length}</strong> نطاقًا خارج الترتيب (راسخةً فورًا) + ما رسخ بالترتيب.</div>
        <div style={{ color: ui.color.muted }}>الحدود الدقيقة تُحسب عند الحفظ من وحدات المسار.</div>
      </div>

      <Button onClick={() => onSave({ reachedSurah: rs ? +rs : null, reachedAyah: ra ? +ra : null, outOfOrder: ooo })}>حفظ التسكين</Button>
    </Card>
  );
}
