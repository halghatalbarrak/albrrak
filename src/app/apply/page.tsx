"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseOptions, type Options } from "./options";

type Status = { kind: "idle" | "sending" } | { kind: "ok" } | { kind: "error"; message: string };
type Load = "loading" | "ready" | "error";

const box: React.CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
  padding: "1.5rem",
  fontFamily: "system-ui, sans-serif",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 };
const input: React.CSSProperties = { padding: "0.5rem", fontSize: "1rem", fontFamily: "inherit" };

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
    return <main style={box}>جارٍ التحميل…</main>;
  }

  if (load === "error") {
    return (
      <main style={box}>
        <h1>تعذّر تحميل النموذج</h1>
        <p style={{ opacity: 0.75 }}>حدث خطأ أثناء جلب البيانات. حاول مرة أخرى.</p>
        <button style={{ ...input, cursor: "pointer" }} onClick={() => void loadOptions()}>
          إعادة المحاولة
        </button>
      </main>
    );
  }

  if (status.kind === "ok") {
    return (
      <main style={box}>
        <h1>تمّ استلام طلب القيد</h1>
        <p>سيُنظر فيه ويُبلَّغ وليّ الأمر بالنتيجة إن شاء الله.</p>
      </main>
    );
  }

  const noNationalities = opts.nationalities.length === 0;

  // ── الخطوة ١: تاريخ الميلاد وحده ──
  if (step === 1) {
    return (
      <main style={box}>
        <h1 style={{ marginBottom: 4 }}>نموذج القيد</h1>
        <p style={{ opacity: 0.7, marginTop: 0 }}>حلقات البراك — تُملأ بلا حساب.</p>
        <label style={field}>
          <span>تاريخ الميلاد (ميلادي)</span>
          <input
            style={input}
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            required
          />
        </label>
        <button
          style={{ ...input, cursor: "pointer", fontWeight: 700 }}
          disabled={!birthDate}
          onClick={() => setStep(2)}
        >
          التالي
        </button>
      </main>
    );
  }

  // ── الخطوة ٢: باقي الحقول، بخطابٍ يناسب العمر ──
  return (
    <main style={box}>
      <h1 style={{ marginBottom: 4 }}>نموذج القيد</h1>
      <p style={{ opacity: 0.85, marginTop: 0 }}>
        {isChild
          ? "هذا الطالب دون الثالثة عشرة. على ولي الأمر تعبئة البيانات."
          : "الطالب هو من يعبّئ بياناته."}
      </p>
      <button
        style={{ ...input, cursor: "pointer", marginBottom: 12 }}
        type="button"
        onClick={() => setStep(1)}
      >
        ← تعديل تاريخ الميلاد
      </button>

      {noNationalities && (
        <p style={{ color: "#8a6d00" }}>
          قوائم الجنسيات غير متاحة حاليًا — تعذّر إتمام النموذج. أبلغ الإدارة.
        </p>
      )}

      <form onSubmit={onSubmit}>
        <label style={field}>
          <span>الاسم كما في الهوية</span>
          <input style={input} name="nameAsInId" required />
        </label>

        <label style={field}>
          <span>رقم الهوية</span>
          <input style={input} name="nationalId" required inputMode="numeric" />
        </label>

        <label style={field}>
          <span>الجنسية (اكتب للبحث)</span>
          <input style={input} name="nationalityName" list="nationalities-list" required autoComplete="off" />
          <datalist id="nationalities-list">
            {opts.nationalities.map((n) => (
              <option key={n.id} value={n.nameAr} />
            ))}
          </datalist>
        </label>

        <label style={field}>
          <span>الجنس</span>
          <select style={input} name="gender" required defaultValue="MALE">
            <option value="MALE">ذكر</option>
            <option value="FEMALE">أنثى</option>
          </select>
        </label>

        <label style={field}>
          <span>المرحلة الدراسية</span>
          <select style={input} name="schoolStageId" defaultValue="">
            <option value="">—</option>
            {opts.schoolStages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameAr}
              </option>
            ))}
          </select>
        </label>

        <label style={field}>
          <span>جوال ولي الأمر (يبدأ بـ 966)</span>
          <input style={input} name="guardianPhone" required inputMode="tel" />
        </label>

        <label style={field}>
          <span>جنس ولي الأمر</span>
          <select style={input} name="guardianGender" required defaultValue="MALE">
            <option value="MALE">ذكر</option>
            <option value="FEMALE">أنثى</option>
          </select>
        </label>

        <label style={field}>
          <span>صفة ولي الأمر</span>
          <select style={input} name="guardianRelationId" required defaultValue="">
            <option value="" disabled>
              اختر…
            </option>
            {opts.guardianRelations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nameAr}
              </option>
            ))}
          </select>
        </label>

        <label style={field}>
          <span>جوال الطالب {phoneRequired ? "(إلزامي — شرط حسابه)" : "(اختياري)"}</span>
          <input style={input} name="studentPhone" inputMode="tel" required={phoneRequired} />
        </label>

        <fieldset style={{ border: "1px solid #ccc", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: 12 }}>
          <legend style={{ padding: "0 6px" }}>جهة اتصال الطوارئ — حين لا يردّ ولي الأمر</legend>
          <label style={field}>
            <span>الاسم</span>
            <input style={input} name="emergencyName" required />
          </label>
          <label style={field}>
            <span>الجوال (يخالف جوال ولي الأمر)</span>
            <input style={input} name="emergencyPhone" required inputMode="tel" />
          </label>
          <label style={{ ...field, marginBottom: 0 }}>
            <span>الصفة</span>
            <select style={input} name="emergencyRelationId" required defaultValue="">
              <option value="" disabled>
                اختر…
              </option>
              {opts.guardianRelations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nameAr}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <label style={field}>
          <span>مقدار الحفظ (بالأجزاء)</span>
          <input style={input} name="priorHifzJuz" type="number" min={0} max={30} />
        </label>

        {status.kind === "error" && <p style={{ color: "#b00020" }}>{status.message}</p>}

        <button
          style={{ ...input, cursor: "pointer", fontWeight: 700 }}
          type="submit"
          disabled={status.kind === "sending" || noNationalities}
        >
          {status.kind === "sending" ? "جارٍ الإرسال…" : "إرسال طلب القيد"}
        </button>
      </form>
    </main>
  );
}
