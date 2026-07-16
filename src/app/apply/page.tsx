"use client";

import { useEffect, useState } from "react";

interface Options {
  nationalities: { id: string; nameAr: string }[];
  schoolStages: { id: string; nameAr: string }[];
}

type Status = { kind: "idle" | "sending" } | { kind: "ok" } | { kind: "error"; message: string };

const box: React.CSSProperties = {
  maxWidth: 560,
  margin: "0 auto",
  padding: "1.5rem",
  fontFamily: "system-ui, sans-serif",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 };
const input: React.CSSProperties = { padding: "0.5rem", fontSize: "1rem", fontFamily: "inherit" };

export default function ApplyPage() {
  const [opts, setOpts] = useState<Options | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    fetch("/api/registration-options")
      .then((r) => r.json())
      .then(setOpts)
      .catch(() => setOpts({ nationalities: [], schoolStages: [] }));
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: "sending" });
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 201) {
        setStatus({ kind: "ok" });
        e.currentTarget.reset();
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({ kind: "error", message: j.error ?? "تعذّر إرسال الطلب." });
      }
    } catch {
      setStatus({ kind: "error", message: "تعذّر الاتصال." });
    }
  }

  if (status.kind === "ok") {
    return (
      <main style={box}>
        <h1>تمّ استلام طلب القيد</h1>
        <p>سيُنظر فيه ويُبلَّغ وليّ الأمر بالنتيجة إن شاء الله.</p>
      </main>
    );
  }

  return (
    <main style={box}>
      <h1 style={{ marginBottom: 4 }}>نموذج القيد</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>حلقات البراك — تُملأ من الأسرة بلا حساب.</p>

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
          <span>الجنسية</span>
          <select style={input} name="nationalityId" required defaultValue="">
            <option value="" disabled>
              اختر…
            </option>
            {opts?.nationalities.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nameAr}
              </option>
            ))}
          </select>
        </label>

        <label style={field}>
          <span>تاريخ الميلاد (ميلادي)</span>
          <input style={input} name="birthDate" type="date" required />
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
            {opts?.schoolStages.map((s) => (
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
          <span>جوال الطالب (يُترك فارغًا لمن دون ١٣)</span>
          <input style={input} name="studentPhone" inputMode="tel" />
        </label>

        <label style={field}>
          <span>مقدار الحفظ (بالأجزاء)</span>
          <input style={input} name="priorHifzJuz" type="number" min={0} max={30} />
        </label>

        {status.kind === "error" && (
          <p style={{ color: "#b00020" }}>{status.message}</p>
        )}

        <button
          style={{ ...input, cursor: "pointer", fontWeight: 700 }}
          type="submit"
          disabled={status.kind === "sending"}
        >
          {status.kind === "sending" ? "جارٍ الإرسال…" : "إرسال طلب القيد"}
        </button>
      </form>
    </main>
  );
}
