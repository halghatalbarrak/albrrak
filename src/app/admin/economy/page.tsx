"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import {
  AppShell, Button, Input, Select, Field, Badge, Table, ui, sp, type Column,
} from "@/components/ui";

type GrantSource = "AUTO" | "TEACHER" | "ADMIN";
type LimitPeriod = "DAY" | "WEEK" | "NONE";
type EventType =
  | "ATTENDANCE" | "HIZB_EXAM_PASS"
  | "STAGE_EXAM_PASS" | "DAILY_HARVEST" | "PROMOTION" | "QAIDAH_COMPLETE"
  | "ATTENDANCE_PRESENT" | "ATTENDANCE_LATE" | "ATTENDANCE_ABSENT" | "ATTENDANCE_LEFT_NO_PERMISSION"
  | "HIFZ_DONE" | "HIFZ_MISSED" | "TARSEEKH_DONE" | "TARSEEKH_MISSED" | "MURAJAAH_DONE" | "MURAJAAH_MISSED"
  | "HIFZ_EXTRA" | "TARSEEKH_EXTRA" | "MURAJAAH_EXTRA";

interface Item {
  id: string;
  nameAr: string;
  value: number;
  grantSource: GrantSource;
  limitCount: number | null;
  limitPeriod: LimitPeriod;
  active: boolean;
  eventType: EventType | null;
}

const SOURCE_AR: Record<GrantSource, string> = {
  AUTO: "تلقائيّ (النظام)",
  TEACHER: "المعلّم",
  ADMIN: "الإدارة",
};
const PERIOD_AR: Record<LimitPeriod, string> = { DAY: "يوميّ", WEEK: "أسبوعيّ", NONE: "بلا حدّ" };
// أنواع الأحداث للربط التلقائيّ (م٦أ-٢ + م ب). «حضور» العام خامدٌ — استعمل الحالات المفصّلة.
const EVENT_AR: Record<EventType, string> = {
  ATTENDANCE: "حضور (عامّ — خامد، استعمل المفصّلة)",
  HIZB_EXAM_PASS: "اجتياز الحزب",
  STAGE_EXAM_PASS: "اجتياز اختبار المرحلة",
  DAILY_HARVEST: "إتمام الحصاد اليوميّ",
  PROMOTION: "ترقية/انتقال المرحلة",
  QAIDAH_COMPLETE: "إتمام القاعدة المدنية",
  ATTENDANCE_PRESENT: "حضور: حاضر",
  ATTENDANCE_LATE: "حضور: متأخّر",
  ATTENDANCE_ABSENT: "حضور: غائب",
  ATTENDANCE_LEFT_NO_PERMISSION: "حضور: خرج بدون إذن",
  HIFZ_DONE: "الحفظ: أتقن",
  HIFZ_MISSED: "الحفظ: لم يُتقن",
  TARSEEKH_DONE: "الترسيخ: تمّ",
  TARSEEKH_MISSED: "الترسيخ: لم يتمّ",
  MURAJAAH_DONE: "المراجعة: تمّت",
  MURAJAAH_MISSED: "المراجعة: لم تتمّ",
  HIFZ_EXTRA: "الحفظ: زيادة",
  TARSEEKH_EXTRA: "الترسيخ: زيادة",
  MURAJAAH_EXTRA: "المراجعة: زيادة",
};

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

const EMPTY = { id: "", nameAr: "", value: "", grantSource: "TEACHER" as GrantSource, limitPeriod: "NONE" as LimitPeriod, limitCount: "", eventType: "ATTENDANCE" as EventType };

export default function AdminEconomyPage() {
  const { me } = useMe();
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);

  const load = useCallback(async () => {
    const t = await token();
    if (!t) { window.location.href = "/login"; return; }
    const res = await fetch("/api/admin/economy", { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) { setErr("لا صلاحية — هذه الشاشة للإدارة."); return; }
    if (!res.ok) { setErr("تعذّر جلب البنود."); return; }
    const data = (await res.json().catch(() => null)) as { items?: Item[] } | null;
    setItems(data?.items ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    const t = await token();
    if (!t) return;
    const body = {
      ...(form.id ? { id: form.id } : {}),
      nameAr: form.nameAr.trim(),
      value: Number(form.value),
      grantSource: form.grantSource,
      limitPeriod: form.limitPeriod,
      limitCount: form.limitPeriod === "NONE" ? null : Number(form.limitCount),
      // نوع الحدث يُرسَل لبنود AUTO فقط (م٦أ-٢).
      eventType: form.grantSource === "AUTO" ? form.eventType : null,
    };
    const res = await fetch("/api/admin/economy", {
      method: form.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
    });
    if (res.ok) { setForm(EMPTY); setErr(null); void load(); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? "تعذّر الحفظ."); }
  }

  async function toggle(item: Item) {
    const t = await token();
    if (!t) return;
    const res = await fetch("/api/admin/economy", {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ id: item.id, active: !item.active }),
    });
    if (res.ok) void load();
    else setErr("تعذّر تغيير الحالة.");
  }

  function edit(item: Item) {
    setForm({
      id: item.id, nameAr: item.nameAr, value: String(item.value),
      grantSource: item.grantSource, limitPeriod: item.limitPeriod,
      limitCount: item.limitCount == null ? "" : String(item.limitCount),
      eventType: item.eventType ?? "ATTENDANCE",
    });
  }

  const cols: Column<Item>[] = [
    { key: "name", header: "البند", cell: (i) => <span style={{ opacity: i.active ? 1 : 0.5 }}>{i.nameAr}</span> },
    { key: "value", header: "القيمة", cell: (i) => (
      <Badge tone={i.value >= 0 ? "success" : "danger"}>{i.value >= 0 ? "+" : "−"}{arNum(Math.abs(i.value))}</Badge>
    ) },
    { key: "source", header: "المصدر", cell: (i) => (
      <span>{SOURCE_AR[i.grantSource]}{i.grantSource === "AUTO" && i.eventType ? ` — ${EVENT_AR[i.eventType]}` : ""}</span>
    ) },
    { key: "limit", header: "الحدّ", cell: (i) => (
      <span>{i.limitPeriod === "NONE" ? "بلا حدّ" : `${arNum(i.limitCount ?? 0)} / ${PERIOD_AR[i.limitPeriod]}`}</span>
    ) },
    { key: "state", header: "الحالة", cell: (i) => (i.active ? <Badge tone="success">مُفعَّل</Badge> : <Badge tone="neutral">معطَّل</Badge>) },
    { key: "act", header: "إجراء", cell: (i) => (
      <div style={{ display: "flex", gap: sp(2), justifyContent: "flex-end" }}>
        <Button variant="ghost" size="sm" onClick={() => edit(i)}>تعديل</Button>
        <Button variant="ghost" size="sm" onClick={() => void toggle(i)}>{i.active ? "تعطيل" : "تفعيل"}</Button>
      </div>
    ) },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/economy"
      title="بنود النقاط" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "النقاط" }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !items && <p style={{ color: ui.color.muted }}>جارٍ التحميل…</p>}

      {items && (
        <>
          <p style={{ color: ui.color.muted }}>
            القيمة الموجبة كسبٌ والسالبة خصم. المصدر يحدّد من يمنح (المعلّم/الإدارة)؛ والتلقائيّ يمنحه النظام عند حدثٍ تختاره.
            الحدّ عددُ مرّاتٍ في فترة. تعطيلٌ لا حذف.
          </p>

          <section style={{ background: ui.color.surface, border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.lg, padding: sp(4), marginBottom: sp(6) }}>
            <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(3) }}>{form.id ? "تعديل بند" : "بندٌ جديد"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp(3) }}>
              <Field label="الاسم"><Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} placeholder="مثال: إتقان الحفظ" /></Field>
              <Field label="القيمة (موجب كسب / سالب خصم)"><Input type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} placeholder="5 أو -2" /></Field>
              <Field label="مصدر المنح">
                <Select value={form.grantSource} onChange={(e) => setForm((f) => ({ ...f, grantSource: e.target.value as GrantSource }))}>
                  <option value="TEACHER">{SOURCE_AR.TEACHER}</option>
                  <option value="ADMIN">{SOURCE_AR.ADMIN}</option>
                  <option value="AUTO">{SOURCE_AR.AUTO}</option>
                </Select>
              </Field>
              <Field label="فترة الحدّ">
                <Select value={form.limitPeriod} onChange={(e) => setForm((f) => ({ ...f, limitPeriod: e.target.value as LimitPeriod }))}>
                  <option value="NONE">{PERIOD_AR.NONE}</option>
                  <option value="DAY">{PERIOD_AR.DAY}</option>
                  <option value="WEEK">{PERIOD_AR.WEEK}</option>
                </Select>
              </Field>
              {form.limitPeriod !== "NONE" && (
                <Field label="عدد المرّات في الفترة"><Input type="number" value={form.limitCount} onChange={(e) => setForm((f) => ({ ...f, limitCount: e.target.value }))} placeholder="مثال: 1" /></Field>
              )}
              {form.grantSource === "AUTO" && (
                <Field label="الحدث المربوط (يمنحه النظام تلقائياً)">
                  <Select value={form.eventType} onChange={(e) => setForm((f) => ({ ...f, eventType: e.target.value as EventType }))}>
                    {(Object.keys(EVENT_AR) as EventType[]).map((k) => (
                      <option key={k} value={k}>{EVENT_AR[k]}</option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
            <div style={{ display: "flex", gap: sp(2), marginTop: sp(3) }}>
              <Button onClick={() => void save()}>{form.id ? "حفظ التعديل" : "إضافة"}</Button>
              {form.id && <Button variant="ghost" onClick={() => setForm(EMPTY)}>إلغاء</Button>}
            </div>
          </section>

          <Table columns={cols} rows={items} empty="لا بنود بعد — أضِف أوّل بند." />
        </>
      )}
    </AppShell>
  );
}
