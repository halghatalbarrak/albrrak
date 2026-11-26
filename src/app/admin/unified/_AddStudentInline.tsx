"use client";

import { useEffect, useState } from "react";
import { Button, Card, sp, ui } from "@/components/ui";
import { tUnified as tu } from "@/i18n/ar/unified";
import { token } from "./_types";
import { SurahSelect, AyahSelect } from "./_SurahAyahSelect";

interface Program { id: string; key: string; nameAr: string }
interface Lesson { id: string; nameAr: string; chapterName: string | null }

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

const iStyle = (): React.CSSProperties => ({
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{children}</span>;
}

function FieldRow({ children, full }: { children: React.ReactNode; full?: boolean }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: sp(1), gridColumn: full ? "1 / -1" : undefined }}>
      {children}
    </label>
  );
}

export function AddStudentInline({ circleId, defaultProgramId, onDone, onCancel }: Props) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [name, setName] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [gender, setGender] = useState("MALE");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [programId, setProgramId] = useState(defaultProgramId ?? "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // مراقي
  const [maraqi_surah, setMaraqiSurah] = useState(1);
  const [maraqi_ayah, setMaraqiAyah] = useState(1);

  // القاعدة
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [currentLessonId, setCurrentLessonId] = useState("");

  // مدّكر
  const [muddakirTrack, setMuddakirTrack] = useState("2");

  const selectedProgram = programs.find((p) => p.id === programId);
  const progKey = selectedProgram?.key ?? "";

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

  // تحميل دروس القاعدة حين يختار المعلّم القاعدة المدنيّة
  useEffect(() => {
    if (progKey !== "QAIDAH_MADANIYYAH") return;
    if (lessons.length) return;
    setLessonsLoading(true);
    void (async () => {
      const t = await token();
      if (!t) { setLessonsLoading(false); return; }
      const r = await fetch(`/api/circles/${circleId}/add-student`, { headers: { authorization: `Bearer ${t}` } });
      if (r.ok) {
        const j = (await r.json()) as { lessons: Lesson[] };
        setLessons(j.lessons);
        if (j.lessons.length) setCurrentLessonId(j.lessons[0].id);
      }
      setLessonsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progKey]);

  // إعادة ضبط آية مراقي حين تتغيّر السورة
  useEffect(() => {
    setMaraqiAyah(1);
  }, [maraqi_surah]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) { setErr("الاسم مطلوب"); return; }
    if (!dobDay || !dobMonth || !dobYear) { setErr("تاريخ الميلاد مطلوب"); return; }
    const birthDate = `${dobYear}-${dobMonth.padStart(2, "0")}-${dobDay.padStart(2, "0")}`;
    if (!guardianPhone.trim()) { setErr("جوال ولي الأمر مطلوب"); return; }
    if (!programId) { setErr("البرنامج مطلوب"); return; }
    if (progKey === "QAIDAH_MADANIYYAH" && !currentLessonId) { setErr("اختر الدرس الحاليّ"); return; }

    setLoading(true);
    const t = await token();
    if (!t) { setErr("انتهت الجلسة."); setLoading(false); return; }

    const body: Record<string, unknown> = {
      nameAsInId: name,
      birthDate,
      gender,
      guardianPhone,
      guardianName: guardianName.trim() || undefined,
      programId,
    };

    if (progKey === "MARAQI") {
      body.maraqi = { reachedSurah: maraqi_surah, reachedAyah: maraqi_ayah };
    } else if (progKey === "QAIDAH_MADANIYYAH") {
      body.qaidah = { currentLessonId };
    } else if (progKey === "MUDDAKIR") {
      body.muddakir = { track: Number(muddakirTrack) };
    }

    const res = await fetch(`/api/circles/${circleId}/add-student`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
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

  const is = iStyle();

  return (
    <Card
      data-testid="add-student-form"
      style={{ marginBottom: sp(4), border: `1px solid ${ui.color.goldLine}` }}
    >
      <div style={{ fontWeight: 700, fontSize: ui.text.base, marginBottom: sp(3) }}>
        {tu("addStudentBtn")}
      </div>
      <form onSubmit={(e) => void handleSubmit(e)}>
        {/* الصف الأوّل: الاسم + تاريخ الميلاد */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp(2), marginBottom: sp(2) }}>
          <FieldRow>
            <FieldLabel>{tu("addStudentName")}</FieldLabel>
            <input
              data-testid="add-student-name"
              style={is}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </FieldRow>
          <FieldRow>
            <FieldLabel>{tu("addStudentBirthDate")}</FieldLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: sp(1) }}>
              <select data-testid="add-student-dob-day" style={is} value={dobDay} onChange={(e) => setDobDay(e.target.value)}>
                <option value="">{tu("addStudentDobDay")}</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={String(d)}>{d}</option>
                ))}
              </select>
              <select data-testid="add-student-dob-month" style={is} value={dobMonth} onChange={(e) => setDobMonth(e.target.value)}>
                <option value="">{tu("addStudentDobMonth")}</option>
                {["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"].map((m, i) => (
                  <option key={i + 1} value={String(i + 1)}>{m}</option>
                ))}
              </select>
              <select data-testid="add-student-dob-year" style={is} value={dobYear} onChange={(e) => setDobYear(e.target.value)}>
                <option value="">{tu("addStudentDobYear")}</option>
                {Array.from({ length: 50 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
          </FieldRow>

          {/* الجنس */}
          <FieldRow>
            <FieldLabel>{tu("addStudentGender")}</FieldLabel>
            <select data-testid="add-student-gender" style={is} value={gender} onChange={(e) => setGender(e.target.value)}>
              {GENDER_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FieldRow>

          {/* جوال ولي الأمر */}
          <FieldRow>
            <FieldLabel>{tu("addStudentGuardianPhone")}</FieldLabel>
            <input
              data-testid="add-student-guardian-phone"
              style={is}
              value={guardianPhone}
              onChange={(e) => setGuardianPhone(e.target.value)}
              placeholder="05xxxxxxxx"
              required
            />
          </FieldRow>

          {/* اسم ولي الأمر */}
          <FieldRow full>
            <FieldLabel>{tu("addStudentGuardianName")}</FieldLabel>
            <input
              data-testid="add-student-guardian-name"
              style={is}
              value={guardianName}
              onChange={(e) => setGuardianName(e.target.value)}
              placeholder={tu("addStudentGuardianName")}
            />
          </FieldRow>

          {/* البرنامج */}
          <FieldRow full>
            <FieldLabel>{tu("addStudentProgram")}</FieldLabel>
            <select
              data-testid="add-student-program"
              style={is}
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
            >
              {programs.map((p) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}
            </select>
          </FieldRow>
        </div>

        {/* حقول شرطيّة بحسب البرنامج */}
        {progKey === "MARAQI" && (
          <div
            data-testid="add-student-maraqi-fields"
            style={{ background: ui.color.surface, borderRadius: 8, padding: sp(3), marginBottom: sp(2) }}
          >
            <div style={{ fontSize: ui.text.xs, fontWeight: 600, marginBottom: sp(2) }}>{tu("addStudentMaraqiPosition")}</div>
            <div style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap" }}>
              <SurahSelect value={maraqi_surah} onChange={setMaraqiSurah} />
              <AyahSelect surah={maraqi_surah} value={maraqi_ayah} onChange={setMaraqiAyah} />
            </div>
            <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: `${sp(1)} 0 0` }}>{tu("addStudentMaraqiTrackNote")}</p>
          </div>
        )}

        {progKey === "QAIDAH_MADANIYYAH" && (
          <div
            data-testid="add-student-qaidah-fields"
            style={{ background: ui.color.surface, borderRadius: 8, padding: sp(3), marginBottom: sp(2) }}
          >
            <FieldRow full>
              <FieldLabel>{tu("addStudentQaidahLesson")}</FieldLabel>
              {lessonsLoading ? (
                <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{tu("addStudentQaidahLessonsLoading")}</span>
              ) : (
                <select
                  data-testid="add-student-qaidah-lesson"
                  style={is}
                  value={currentLessonId}
                  onChange={(e) => setCurrentLessonId(e.target.value)}
                >
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.chapterName ? `${l.chapterName} — ` : ""}{l.nameAr}
                    </option>
                  ))}
                </select>
              )}
            </FieldRow>
          </div>
        )}

        {progKey === "MUDDAKIR" && (
          <div
            data-testid="add-student-muddakir-fields"
            style={{ background: ui.color.surface, borderRadius: 8, padding: sp(3), marginBottom: sp(2) }}
          >
            <FieldRow full>
              <FieldLabel>{tu("addStudentMuddakirTrack")}</FieldLabel>
              <select
                data-testid="add-student-muddakir-track"
                style={is}
                value={muddakirTrack}
                onChange={(e) => setMuddakirTrack(e.target.value)}
              >
                <option value="1">{tu("addStudentMuddakirTrack1")}</option>
                <option value="2">{tu("addStudentMuddakirTrack2")}</option>
                <option value="3">{tu("addStudentMuddakirTrack3")}</option>
              </select>
            </FieldRow>
            <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: `${sp(1)} 0 0` }}>{tu("addStudentMuddakirNote")}</p>
          </div>
        )}

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
