"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button, Input, Select, Field, ui, sp } from "@/components/ui";
import { tEconomy as tEco } from "@/i18n/ar/economy";

export type GrantSource = "AUTO" | "TEACHER" | "ADMIN";
export type LimitPeriod = "DAY" | "WEEK" | "NONE";
export type EventType =
  | "ATTENDANCE" | "HIZB_EXAM_PASS"
  | "STAGE_EXAM_PASS" | "DAILY_HARVEST" | "PROMOTION" | "QAIDAH_COMPLETE"
  | "ATTENDANCE_PRESENT" | "ATTENDANCE_LATE" | "ATTENDANCE_ABSENT" | "ATTENDANCE_LEFT_NO_PERMISSION"
  | "HIFZ_DONE" | "HIFZ_MISSED" | "TARSEEKH_DONE" | "TARSEEKH_MISSED" | "MURAJAAH_DONE" | "MURAJAAH_MISSED"
  | "HIFZ_EXTRA" | "TARSEEKH_EXTRA" | "MURAJAAH_EXTRA";

export interface Item {
  id: string;
  nameAr: string;
  value: number;
  grantSource: GrantSource;
  limitCount: number | null;
  limitPeriod: LimitPeriod;
  active: boolean;
  eventType: EventType | null;
}

export const SOURCE_AR: Record<GrantSource, string> = {
  AUTO: tEco("sourceAuto"),
  TEACHER: tEco("sourceTeacher"),
  ADMIN: tEco("sourceAdmin"),
};
export const PERIOD_AR: Record<LimitPeriod, string> = { DAY: tEco("periodDay"), WEEK: tEco("periodWeek"), NONE: tEco("periodNone") };
// أنواع الأحداث للربط التلقائيّ (م٦أ-٢ + م ب). «حضور» العام خامدٌ — استعمل الحالات المفصّلة.
export const EVENT_AR: Record<EventType, string> = {
  ATTENDANCE: tEco("eventAttendance"),
  HIZB_EXAM_PASS: tEco("eventHizbExamPass"),
  STAGE_EXAM_PASS: tEco("eventStageExamPass"),
  DAILY_HARVEST: tEco("eventDailyHarvest"),
  PROMOTION: tEco("eventPromotion"),
  QAIDAH_COMPLETE: tEco("eventQaidahComplete"),
  ATTENDANCE_PRESENT: tEco("eventAttendancePresent"),
  ATTENDANCE_LATE: tEco("eventAttendanceLate"),
  ATTENDANCE_ABSENT: tEco("eventAttendanceAbsent"),
  ATTENDANCE_LEFT_NO_PERMISSION: tEco("eventAttendanceLeftNoPermission"),
  HIFZ_DONE: tEco("eventHifzDone"),
  HIFZ_MISSED: tEco("eventHifzMissed"),
  TARSEEKH_DONE: tEco("eventTarseekhDone"),
  TARSEEKH_MISSED: tEco("eventTarseekhMissed"),
  MURAJAAH_DONE: tEco("eventMurajaahDone"),
  MURAJAAH_MISSED: tEco("eventMurajaahMissed"),
  HIFZ_EXTRA: tEco("eventHifzExtra"),
  TARSEEKH_EXTRA: tEco("eventTarseekhExtra"),
  MURAJAAH_EXTRA: tEco("eventMurajaahExtra"),
};

const EMPTY = { id: "", nameAr: "", value: "", grantSource: "TEACHER" as GrantSource, limitPeriod: "NONE" as LimitPeriod, limitCount: "", eventType: "ATTENDANCE" as EventType };

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export const LIST = "/admin/economy";

/** يحوّل بندًا موجودًا (تعديل) إلى قيم النموذج النصّية. */
export function itemToForm(item: Item): typeof EMPTY {
  return {
    id: item.id, nameAr: item.nameAr, value: String(item.value),
    grantSource: item.grantSource, limitPeriod: item.limitPeriod,
    limitCount: item.limitCount == null ? "" : String(item.limitCount),
    eventType: item.eventType ?? "ATTENDANCE",
  };
}

/**
 * نموذج بند النقاط — يخدم الإضافة (initial=null) والتعديل (initial=البند). نفس API ونفس
 * التحقّق تمامًا (POST/PATCH على /api/admin/economy)؛ بعد الحفظ يعود للقائمة.
 */
export function EconomyForm({ initial }: { initial: Item | null }) {
  const router = useRouter();
  const [form, setForm] = useState<typeof EMPTY>(initial ? itemToForm(initial) : EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const t = await token();
    if (!t) return;
    setSaving(true); setErr(null);
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
    if (res.ok) { router.push(LIST); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? tEco("errSave")); setSaving(false); }
  }

  return (
    <section style={{ background: ui.color.surface, border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.lg, padding: sp(4), maxWidth: 720 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp(3) }}>
        <Field label={tEco("fieldName")}><Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} placeholder={tEco("fieldNamePlaceholder")} /></Field>
        <Field label={tEco("fieldValue")}><Input type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} placeholder={tEco("fieldValuePlaceholder")} /></Field>
        <Field label={tEco("fieldSource")}>
          <Select value={form.grantSource} onChange={(e) => setForm((f) => ({ ...f, grantSource: e.target.value as GrantSource }))}>
            <option value="TEACHER">{SOURCE_AR.TEACHER}</option>
            <option value="ADMIN">{SOURCE_AR.ADMIN}</option>
            <option value="AUTO">{SOURCE_AR.AUTO}</option>
          </Select>
        </Field>
        <Field label={tEco("fieldPeriod")}>
          <Select value={form.limitPeriod} onChange={(e) => setForm((f) => ({ ...f, limitPeriod: e.target.value as LimitPeriod }))}>
            <option value="NONE">{PERIOD_AR.NONE}</option>
            <option value="DAY">{PERIOD_AR.DAY}</option>
            <option value="WEEK">{PERIOD_AR.WEEK}</option>
          </Select>
        </Field>
        {form.limitPeriod !== "NONE" && (
          <Field label={tEco("fieldLimitCount")}><Input type="number" value={form.limitCount} onChange={(e) => setForm((f) => ({ ...f, limitCount: e.target.value }))} placeholder={tEco("fieldLimitCountPlaceholder")} /></Field>
        )}
        {form.grantSource === "AUTO" && (
          <Field label={tEco("fieldEvent")}>
            <Select value={form.eventType} onChange={(e) => setForm((f) => ({ ...f, eventType: e.target.value as EventType }))}>
              {(Object.keys(EVENT_AR) as EventType[]).map((k) => (
                <option key={k} value={k}>{EVENT_AR[k]}</option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      <div style={{ display: "flex", gap: sp(2), marginTop: sp(3) }}>
        <Button onClick={() => void save()} disabled={saving}>{saving ? tEco("saving") : form.id ? tEco("saveEdit") : tEco("add")}</Button>
        <Button variant="ghost" onClick={() => router.push(LIST)}>{tEco("cancel")}</Button>
      </div>
    </section>
  );
}
