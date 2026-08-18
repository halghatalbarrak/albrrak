"use client";
/* eslint-disable @next/next/no-img-element -- شعارٌ من public/ بأبعادٍ ثابتة؛ لا يحتاج next/image. */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { parseOptions, type Options } from "./options";
import { Button, Card, Field, inputStyle, ui, sp } from "@/components/ui";

type Status = { kind: "idle" | "sending" } | { kind: "ok" } | { kind: "error"; message: string };
type Load = "loading" | "ready" | "error";

const BRAND = "حلقات الشيخ محمد البراك";

/** هيكل صفحة التقديم بهوية المنصّة — شعار + بطاقة. */
function Page({ children }: { children: React.ReactNode }) {
  return (
    <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, padding: sp(4) }}>
      <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: sp(3) }}>
        <Link href="/" aria-label={BRAND}><img src="/png/logo.jpeg" alt={BRAND} style={{ height: 64, width: "auto", borderRadius: ui.radius.md }} /></Link>
        <Card style={{ width: "100%" }}>{children}</Card>
      </div>
    </main>
  );
}

/** العمر بالسنوات الكاملة — إرشادٌ للخطاب فقط؛ الإنفاذ في الخادم (م٤). */
function ageFrom(birth: string): number | null {
  const ms = Date.parse(birth);
  if (Number.isNaN(ms)) return null;
  const b = new Date(ms);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  return age;
}

export default function ApplyPage() {
  const [opts, setOpts] = useState<Options>({ nationalities: [], schoolStages: [], guardianRelations: [] });
  const [load, setLoad] = useState<Load>("loading");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [step, setStep] = useState<1 | 2>(1);
  const [birthDate, setBirthDate] = useState("");

  const loadOptions = useCallback(async () => {
    setLoad("loading");
    try {
      const res = await fetch("/api/registration-options");
      if (!res.ok) {
        setLoad("error");
        return;
      }
      setOpts(parseOptions(await res.json()));
      setLoad("ready");
    } catch {
      setLoad("error");
    }
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const age = useMemo(() => ageFrom(birthDate), [birthDate]);
  const isChild = age !== null && age < 13; // دون ١٣: جوال الطالب اختياري
  const phoneRequired = age !== null && age >= 13; // ١٣+: الجوال شرط الحساب

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const raw = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;

    // الجنسية combobox بالاسم ⟵ نحلّه إلى معرّفه (الأسماء فريدة).
    const nat = opts.nationalities.find((n) => n.nameAr === (raw.nationalityName ?? "").trim());
    if (!nat) {
      setStatus({ kind: "error", message: "اختر الجنسية من القائمة." });
      return;
    }

    setStatus({ kind: "sending" });
    const body = {
      nameAsInId: raw.nameAsInId,
      nationalId: raw.nationalId,
      nationalityId: nat.id,
      birthDate,
      gender: raw.gender,
      schoolStageId: raw.schoolStageId || undefined,
      guardianPhone: raw.guardianPhone,
      guardianEmail: raw.guardianEmail || undefined,
      guardianGender: raw.guardianGender,
      guardianRelationId: raw.guardianRelationId,
      studentPhone: raw.studentPhone || undefined,
      emergencyName: raw.emergencyName,
      emergencyPhone: raw.emergencyPhone,
      emergencyRelationId: raw.emergencyRelationId,
      priorHifzJuz: raw.priorHifzJuz || undefined,
    };
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 201) {
        setStatus({ kind: "ok" });
        form.reset();
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({ kind: "error", message: j.error ?? "تعذّر إرسال الطلب." });
      }
    } catch {
      setStatus({ kind: "error", message: "تعذّر الاتصال بالخادم." });
    }
  }

  if (load === "loading") {
    return <Page><p style={{ margin: 0, color: ui.color.muted }}>جارٍ التحميل…</p></Page>;
  }

  if (load === "error") {
    return (
      <Page>
        <h1 style={{ fontSize: ui.text.xl, fontWeight: 700, marginTop: 0 }}>تعذّر تحميل النموذج</h1>
        <p style={{ color: ui.color.muted }}>حدث خطأ أثناء جلب البيانات. حاول مرة أخرى.</p>
        <Button variant="ghost" onClick={() => void loadOptions()}>إعادة المحاولة</Button>
      </Page>
    );
  }

  if (status.kind === "ok") {
    return (
      <Page>
        <h1 style={{ fontSize: ui.text.xl, fontWeight: 700, marginTop: 0 }}>تمّ استلام طلب القيد</h1>
        <p style={{ color: ui.color.muted }}>سيُنظر فيه ويُبلَّغ وليّ الأمر بالنتيجة إن شاء الله.</p>
      </Page>
    );
  }

  const noNationalities = opts.nationalities.length === 0;

  // ── الخطوة ١: تاريخ الميلاد وحده ──
  if (step === 1) {
    return (
      <Page>
        <h1 style={{ fontSize: ui.text.xl, fontWeight: 700, marginTop: 0, marginBottom: sp(1) }}>نموذج القيد</h1>
        <p style={{ color: ui.color.muted, marginTop: 0 }}>حلقات الشيخ محمد البراك — تُملأ بلا حساب.</p>
        <Field label="تاريخ الميلاد (ميلادي)">
          <input style={inputStyle} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required />
        </Field>
        <Button disabled={!birthDate} onClick={() => setStep(2)}>التالي</Button>
      </Page>
    );
  }

  // ── الخطوة ٢: باقي الحقول، بخطابٍ يناسب العمر ──
  return (
    <Page>
      <h1 style={{ fontSize: ui.text.xl, fontWeight: 700, marginTop: 0, marginBottom: sp(1) }}>نموذج القيد</h1>
      <p style={{ color: ui.color.text, marginTop: 0 }}>
        {isChild
          ? "هذا الطالب دون الثالثة عشرة. على ولي الأمر تعبئة البيانات."
          : "الطالب هو من يعبّئ بياناته."}
      </p>
      <Button variant="ghost" size="sm" type="button" style={{ marginBottom: sp(3) }} onClick={() => setStep(1)}>
        ← تعديل تاريخ الميلاد
      </Button>

      {noNationalities && (
        <p style={{ color: ui.color.bronzeHover }}>
          قوائم الجنسيات غير متاحة حاليًا — تعذّر إتمام النموذج. أبلغ الإدارة.
        </p>
      )}

      <form onSubmit={onSubmit}>
        <Field label="الاسم كما في الهوية"><input style={inputStyle} name="nameAsInId" required /></Field>
        <Field label="رقم الهوية"><input style={inputStyle} name="nationalId" required inputMode="numeric" /></Field>

        <Field label="الجنسية (اكتب للبحث)">
          <input style={inputStyle} name="nationalityName" list="nationalities-list" required autoComplete="off" />
          <datalist id="nationalities-list">
            {opts.nationalities.map((n) => <option key={n.id} value={n.nameAr} />)}
          </datalist>
        </Field>

        <Field label="الجنس">
          <select style={inputStyle} name="gender" required defaultValue="MALE">
            <option value="MALE">ذكر</option>
            <option value="FEMALE">أنثى</option>
          </select>
        </Field>

        <Field label="المرحلة الدراسية">
          <select style={inputStyle} name="schoolStageId" defaultValue="">
            <option value="">—</option>
            {opts.schoolStages.map((s) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
          </select>
        </Field>

        <Field label="جوال ولي الأمر (يبدأ بـ 966)"><input style={inputStyle} name="guardianPhone" required inputMode="tel" /></Field>

        <Field label="بريد ولي الأمر (اختياريّ — لتصله تقارير الأسبوع)"><input style={inputStyle} name="guardianEmail" type="email" inputMode="email" autoComplete="off" /></Field>

        <Field label="جنس ولي الأمر">
          <select style={inputStyle} name="guardianGender" required defaultValue="MALE">
            <option value="MALE">ذكر</option>
            <option value="FEMALE">أنثى</option>
          </select>
        </Field>

        <Field label="صفة ولي الأمر">
          <select style={inputStyle} name="guardianRelationId" required defaultValue="">
            <option value="" disabled>اختر…</option>
            {opts.guardianRelations.map((r) => <option key={r.id} value={r.id}>{r.nameAr}</option>)}
          </select>
        </Field>

        <Field label={`جوال الطالب ${phoneRequired ? "(إلزامي — شرط حسابه)" : "(اختياري)"}`}>
          <input style={inputStyle} name="studentPhone" inputMode="tel" required={phoneRequired} />
        </Field>

        <fieldset style={{ border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.lg, padding: sp(4), marginBottom: sp(3) }}>
          <legend style={{ padding: `0 ${sp(1)}`, fontSize: ui.text.xs, fontWeight: 600, color: ui.color.primary }}>جهة اتصال الطوارئ — حين لا يردّ ولي الأمر</legend>
          <Field label="الاسم"><input style={inputStyle} name="emergencyName" required /></Field>
          <Field label="الجوال (يخالف جوال ولي الأمر)"><input style={inputStyle} name="emergencyPhone" required inputMode="tel" /></Field>
          <Field label="الصفة" style={{ marginBottom: 0 }}>
            <select style={inputStyle} name="emergencyRelationId" required defaultValue="">
              <option value="" disabled>اختر…</option>
              {opts.guardianRelations.map((r) => <option key={r.id} value={r.id}>{r.nameAr}</option>)}
            </select>
          </Field>
        </fieldset>

        <Field label="مقدار الحفظ (بالأجزاء)"><input style={inputStyle} name="priorHifzJuz" type="number" min={0} max={30} /></Field>

        {status.kind === "error" && <p style={{ color: ui.color.danger, fontSize: ui.text.xs }}>{status.message}</p>}

        <Button type="submit" disabled={status.kind === "sending" || noNationalities} style={{ width: "100%", marginTop: sp(2) }}>
          {status.kind === "sending" ? "جارٍ الإرسال…" : "إرسال طلب القيد"}
        </Button>
      </form>
    </Page>
  );
}
