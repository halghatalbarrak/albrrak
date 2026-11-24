"use client";

import { useEffect, useState } from "react";
import { Button, Card, sp, ui } from "@/components/ui";
import { tUnified as tu } from "@/i18n/ar/unified";
import { token } from "./_types";

interface Program { id: string; key: string; nameAr: string }

interface Props {
  circleId: string;
  defaultProgramId?: string;
  onDone: (studentId: string, duplicate: boolean) => void;
  onCancel: () => void;
}

const GENDER_OPTS = [
  { value: "MALE", label: "ذكر" },
  { value: "FEMALE", label: "أنثى" },
];

const inputStyle = (ui: { font: string; text: { xs: string }; color: { text: string; border: string; surface: string } }): React.CSSProperties => ({
  fontFamily: ui.font,
  fontSize: ui.text.xs,
  padding: `${sp(1)} ${sp(2)}`,
  borderRadius: 6,
  border: `1px solid ${ui.color.border}`,
  background: ui.color.surface,
  color: ui.color.text,
  width: "100%",
  boxSizing: "border-box" as const,
});

export function AddStudentInline({ circleId, defaultProgramId, onDone, onCancel }: Props) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [name, setName] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [gender, setGender] = useState("MALE");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [programId, setProgramId] = useState(defaultProgramId ?? "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const t = await token();
      if (!t) return;
      const r = await fetch("/api/programs", { headers: { authorization: `Bearer ${t}` } });
      if (r.ok) {
        const j = (await r.json()) as { programs: Program[] };
        setPrograms(j.programs);
        if (!programId && j.programs.length) {
          setProgramId(defaultProgramId ?? j.programs[0].id);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) { setErr("الاسم مطلوب"); return; }
    if (!dobDay || !dobMonth || !dobYear) { setErr("تاريخ الميلاد مطلوب"); return; }
    const birthDate = `${dobYear}-${dobMonth.padStart(2, "0")}-${dobDay.padStart(2, "0")}`;
    if (!guardianPhone.trim()) { setErr("جوال ولي الأمر مطلوب"); return; }
    if (!programId) { setErr("البرنامج مطلوب"); return; }

    setLoading(true);
    const t = await token();
    if (!t) { setErr("انتهت الجلسة."); setLoading(false); return; }

    const res = await fetch(`/api/circles/${circleId}/add-student`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ nameAsInId: name, birthDate, gender, guardianPhone, programId }),
    });

    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      setErr(j.error ?? "تعذّر الإضافة.");
      return;
    }
    const r = (await res.json()) as { studentId: string; duplicate: boolean };
    onDone(r.studentId, r.duplicate);
  }

  const iStyle = inputStyle(ui);

  return (
    <Card
      data-testid="add-student-form"
      style={{ marginBottom: sp(4), border: `1px solid ${ui.color.goldLine}` }}
    >
      <div style={{ fontWeight: 700, fontSize: ui.text.base, marginBottom: sp(3) }}>
        {tu("addStudentBtn")}
      </div>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp(2), marginBottom: sp(2) }}>
          <label style={{ display: "flex", flexDirection: "column", gap: sp(1) }}>
            <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{tu("addStudentName")}</span>
            <input
              data-testid="add-student-name"
              style={iStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: sp(1) }}>
            <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{tu("addStudentBirthDate")}</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: sp(1) }}>
              <select data-testid="add-student-dob-day" style={iStyle} value={dobDay} onChange={(e) => setDobDay(e.target.value)}>
                <option value="">يوم</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={String(d)}>{d}</option>
                ))}
              </select>
              <select data-testid="add-student-dob-month" style={iStyle} value={dobMonth} onChange={(e) => setDobMonth(e.target.value)}>
                <option value="">شهر</option>
                {["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"].map((m, i) => (
                  <option key={i + 1} value={String(i + 1)}>{m}</option>
                ))}
              </select>
              <select data-testid="add-student-dob-year" style={iStyle} value={dobYear} onChange={(e) => setDobYear(e.target.value)}>
                <option value="">سنة</option>
                {Array.from({ length: 50 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: sp(1) }}>
            <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{tu("addStudentGender")}</span>
            <select
              data-testid="add-student-gender"
              style={iStyle}
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              {GENDER_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: sp(1) }}>
            <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{tu("addStudentGuardianPhone")}</span>
            <input
              data-testid="add-student-guardian-phone"
              style={iStyle}
              value={guardianPhone}
              onChange={(e) => setGuardianPhone(e.target.value)}
              placeholder="05xxxxxxxx"
              required
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: sp(1), gridColumn: "1 / -1" }}>
            <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{tu("addStudentProgram")}</span>
            <select
              data-testid="add-student-program"
              style={iStyle}
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
            >
              {programs.map((p) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}
            </select>
          </label>
        </div>

        {err && <p style={{ color: ui.color.danger, fontSize: ui.text.xs, margin: `0 0 ${sp(2)} 0` }}>{err}</p>}

        <div style={{ display: "flex", gap: sp(2) }}>
          <Button
            data-testid="add-student-submit"
            type="submit"
            variant="primary"
            size="sm"
            disabled={loading}
          >
            {loading ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {tu("cancelBtn")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
