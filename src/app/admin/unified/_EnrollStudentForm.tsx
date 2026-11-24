"use client";

/**
 * نموذج «تسجيل طالب جديد» الكامل.
 * يُخرج طالبًا جاهزًا بلا «إعداد ناقص» حين يجتاز اختبار القراءة.
 */
import { useEffect, useReducer, useState } from "react";
import { Button, Card, sp, ui } from "@/components/ui";
import { tUnified as tu } from "@/i18n/ar/unified";
import { SURAH_NAMES, SURAH_AYAH_COUNTS_TANZIL } from "@/lib/surah-names";
import { token } from "./_types";

// ═══════════════ أنواع البيانات ═══════════════

interface Program { id: string; key: string; nameAr: string }
interface Track { id: string; nameAr: string; linesPerDay: number; ordinal: number }
interface Supervisor { id: string; nameAr: string; currentLoad: number }

type ReadingTestResult = "PASSED" | "FAILED" | "DEFER";
type DateMode = "GREG" | "HIJRI";

interface FormState {
  nameAsInId: string;
  dateMode: DateMode;
  // ميلادي
  gregYear: string;
  gregMonth: string;
  gregDay: string;
  // هجري
  hijriYear: string;
  hijriMonth: string;
  hijriDay: string;
  gender: "MALE" | "FEMALE";
  guardianPhone: string;
  guardianName: string;
  programId: string;
  // مراقي / قاعدة
  startSurah: number;
  startAyah: number;
  trackId: string;
  readingTestResult: ReadingTestResult | "";
  // مدّكِر
  muddakirTrack: 1 | 2 | 3;
  supervisorId: string;
  // إضافي
  schoolStage: string;
  studentPhone: string;
  notes: string;
  showOptional: boolean;
}

const INIT: FormState = {
  nameAsInId: "", dateMode: "GREG",
  gregYear: "", gregMonth: "", gregDay: "",
  hijriYear: "", hijriMonth: "", hijriDay: "",
  gender: "MALE",
  guardianPhone: "", guardianName: "",
  programId: "",
  startSurah: 1, startAyah: 1,
  trackId: "", readingTestResult: "",
  muddakirTrack: 1, supervisorId: "",
  schoolStage: "", studentPhone: "", notes: "",
  showOptional: false,
};

type Action =
  | { type: "SET"; key: keyof FormState; value: FormState[keyof FormState] }
  | { type: "SET_SURAH"; surah: number }
  | { type: "RESET" };

function reducer(state: FormState, action: Action): FormState {
  if (action.type === "RESET") return INIT;
  if (action.type === "SET_SURAH") {
    return { ...state, startSurah: action.surah, startAyah: 1 };
  }
  return { ...state, [action.key]: action.value };
}

// ═══════════════ تحويل هجري↔ميلادي (خوارزميّة بسيطة) ═══════════════

function hijriToGregorian(hYear: number, hMonth: number, hDay: number): Date | null {
  if (hYear < 1300 || hYear > 1500 || hMonth < 1 || hMonth > 12 || hDay < 1 || hDay > 30) return null;
  // Julian Day Number
  const jdn = Math.trunc((11 * hYear + 3) / 30) + 354 * hYear + 30 * hMonth
    - Math.trunc((hMonth - 1) / 2) + hDay + 1948440 - 385;
  const l = jdn + 68569;
  const n = Math.trunc((4 * l) / 146097);
  const l2 = l - Math.trunc((146097 * n + 3) / 4);
  const i = Math.trunc((4000 * (l2 + 1)) / 1461001);
  const l3 = l2 - Math.trunc((1461 * i) / 4) + 31;
  const j = Math.trunc((80 * l3) / 2447);
  const day = l3 - Math.trunc((2447 * j) / 80);
  const l4 = Math.trunc(j / 11);
  const month = j + 2 - 12 * l4;
  const year = 100 * (n - 49) + i + l4;
  return new Date(year, month - 1, day);
}

function resolveBirthDate(state: FormState): Date | null {
  if (state.dateMode === "GREG") {
    const y = parseInt(state.gregYear);
    const m = parseInt(state.gregMonth);
    const d = parseInt(state.gregDay);
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    if (isNaN(dt.getTime())) return null;
    return dt;
  }
  const hy = parseInt(state.hijriYear);
  const hm = parseInt(state.hijriMonth);
  const hd = parseInt(state.hijriDay);
  if (!hy || !hm || !hd) return null;
  return hijriToGregorian(hy, hm, hd);
}

// ═══════════════ مساعدات UI ═══════════════

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

const labelWrap: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: sp(1),
};
const labelText: React.CSSProperties = {
  fontSize: ui.text.xs, color: ui.color.muted,
};
const grid2: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp(2), marginBottom: sp(2),
};
const grid3: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: sp(2), marginBottom: sp(2),
};

// ═══════════════ المكوّن ═══════════════

interface Props {
  circleId: string;
  defaultProgramId?: string;
  onDone: (studentId: string, duplicate: boolean, setupComplete: boolean) => void;
  onCancel: () => void;
}

export function EnrollStudentForm({ circleId, defaultProgramId, onDone, onCancel }: Props) {
  const [state, dispatch] = useReducer(reducer, {
    ...INIT,
    programId: defaultProgramId ?? "",
    muddakirTrack: 1,
  });
  const [programs, setPrograms] = useState<Program[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [suggestedTrackId, setSuggestedTrackId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // تحميل البيانات المرجعيّة
  useEffect(() => {
    void (async () => {
      const t = await token();
      if (!t) return;
      const r = await fetch(`/api/students/enroll-data?circleId=${circleId}`, {
        headers: { authorization: `Bearer ${t}` },
      });
      if (!r.ok) return;
      const j = (await r.json()) as { programs: Program[]; tracks: Track[]; supervisors: Supervisor[] };
      setPrograms(j.programs);
      setTracks(j.tracks);
      setSupervisors(j.supervisors);
      if (!state.programId && j.programs.length) {
        const first = defaultProgramId ?? j.programs[0].id;
        dispatch({ type: "SET", key: "programId", value: first });
      }
      if (j.tracks.length) {
        dispatch({ type: "SET", key: "trackId", value: j.tracks[0].id });
        setSuggestedTrackId(j.tracks[0].id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleId]);

  const curProgramKey = programs.find((p) => p.id === state.programId)?.key ?? "";
  const isMaraqi = curProgramKey === "MARAQI" || curProgramKey === "QAIDAH_MADANIYYAH";
  const isMuddakir = curProgramKey === "MUDDAKIR";
  const isMaraqiOnly = curProgramKey === "MARAQI";

  // عدد آيات السورة المختارة
  const maxAyah = SURAH_AYAH_COUNTS_TANZIL[state.startSurah] ?? 1;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!state.nameAsInId.trim()) { setErr(tu("enrollNameLabel") + " مطلوب"); return; }
    const birthDate = resolveBirthDate(state);
    if (!birthDate) { setErr(tu("enrollBirthDateLabel") + " غير صحيح"); return; }
    if (!state.guardianPhone.trim()) { setErr(tu("enrollGuardianPhoneLabel") + " مطلوب"); return; }
    if (!state.programId) { setErr(tu("enrollProgramLabel") + " مطلوب"); return; }
    if (isMaraqi && !state.readingTestResult) { setErr(tu("enrollReadingTestLabel") + " مطلوب"); return; }
    if (isMaraqiOnly && state.readingTestResult === "PASSED" && !state.trackId) {
      setErr(tu("enrollTrackLabel") + " مطلوب"); return;
    }

    // بناء programFields
    let programFields: unknown;
    if (isMuddakir) {
      programFields = {
        kind: "MUDDAKIR",
        muddakirTrack: state.muddakirTrack,
        supervisorId: state.supervisorId || undefined,
      };
    } else if (curProgramKey === "QAIDAH_MADANIYYAH") {
      programFields = {
        kind: "QAIDAH",
        readingTestResult: state.readingTestResult,
      };
    } else {
      programFields = {
        kind: "MARAQI",
        startSurah: state.startSurah,
        startAyah: state.startAyah,
        trackId: state.trackId,
        trackSource: state.trackId === suggestedTrackId ? "AUTO_FROM_FRONTIER" : "MANUAL",
        readingTestResult: state.readingTestResult,
      };
    }

    setLoading(true);
    const t = await token();
    if (!t) { setErr("انتهت الجلسة."); setLoading(false); return; }

    const res = await fetch("/api/students/enroll", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({
        nameAsInId: state.nameAsInId.trim(),
        birthDateIso: birthDate.toISOString(),
        gender: state.gender,
        guardianPhone: state.guardianPhone.trim(),
        guardianName: state.guardianName.trim() || undefined,
        circleId,
        programId: state.programId,
        programFields,
        schoolStage: state.schoolStage || undefined,
        studentPhone: state.studentPhone || undefined,
        notes: state.notes || undefined,
      }),
    });

    setLoading(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? "تعذّر التسجيل.");
      return;
    }
    const r = (await res.json()) as { studentId: string; duplicate: boolean; setupComplete: boolean };
    dispatch({ type: "RESET" });
    onDone(r.studentId, r.duplicate, r.setupComplete);
  }

  return (
    <Card
      data-testid="enroll-student-form"
      style={{ marginBottom: sp(4), border: `1px solid ${ui.color.goldLine}` }}
    >
      <div style={{ fontWeight: 700, fontSize: ui.text.base, marginBottom: sp(3) }}>
        {tu("enrollTitle")}
      </div>

      <form onSubmit={(e) => void handleSubmit(e)}>
        {/* ── الاسم والجنس ── */}
        <div style={grid2}>
          <label style={labelWrap}>
            <span style={labelText}>{tu("enrollNameLabel")}</span>
            <input
              data-testid="enroll-name"
              style={iStyle()}
              value={state.nameAsInId}
              onChange={(e) => dispatch({ type: "SET", key: "nameAsInId", value: e.target.value })}
              placeholder="الاسم الرباعيّ كما في الهويّة"
              required
            />
          </label>
          <label style={labelWrap}>
            <span style={labelText}>{tu("enrollGenderLabel")}</span>
            <select
              data-testid="enroll-gender"
              style={iStyle()}
              value={state.gender}
              onChange={(e) => dispatch({ type: "SET", key: "gender", value: e.target.value as "MALE" | "FEMALE" })}
            >
              <option value="MALE">{tu("enrollGenderMale")}</option>
              <option value="FEMALE">{tu("enrollGenderFemale")}</option>
            </select>
          </label>
        </div>

        {/* ── تاريخ الميلاد ── */}
        <div style={{ marginBottom: sp(2) }}>
          <div style={{ display: "flex", gap: sp(2), marginBottom: sp(1) }}>
            <span style={labelText}>{tu("enrollBirthDateLabel")}</span>
            <button
              type="button"
              onClick={() => dispatch({ type: "SET", key: "dateMode", value: "GREG" })}
              style={{
                fontSize: ui.text.xs, padding: `0 ${sp(1)}`,
                background: state.dateMode === "GREG" ? ui.color.goldLine : "transparent",
                border: `1px solid ${ui.color.border}`, borderRadius: 4, cursor: "pointer",
                fontFamily: ui.font, color: ui.color.text,
              }}
            >
              {tu("enrollBirthGreg")}
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "SET", key: "dateMode", value: "HIJRI" })}
              style={{
                fontSize: ui.text.xs, padding: `0 ${sp(1)}`,
                background: state.dateMode === "HIJRI" ? ui.color.goldLine : "transparent",
                border: `1px solid ${ui.color.border}`, borderRadius: 4, cursor: "pointer",
                fontFamily: ui.font, color: ui.color.text,
              }}
            >
              {tu("enrollBirthHijri")}
            </button>
          </div>
          {state.dateMode === "GREG" ? (
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: sp(2) }}>
              <input
                data-testid="enroll-birth-year"
                style={iStyle()} type="number" placeholder="السنة (م)"
                value={state.gregYear}
                onChange={(e) => dispatch({ type: "SET", key: "gregYear", value: e.target.value })}
                min={1900} max={2030}
              />
              <select
                data-testid="enroll-birth-month"
                style={iStyle()}
                value={state.gregMonth}
                onChange={(e) => dispatch({ type: "SET", key: "gregMonth", value: e.target.value })}
              >
                <option value="">الشهر</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <select
                data-testid="enroll-birth-day"
                style={iStyle()}
                value={state.gregDay}
                onChange={(e) => dispatch({ type: "SET", key: "gregDay", value: e.target.value })}
              >
                <option value="">اليوم</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: sp(2) }}>
              <input
                data-testid="enroll-birth-hijri-year"
                style={iStyle()} type="number" placeholder="السنة (هـ)"
                value={state.hijriYear}
                onChange={(e) => dispatch({ type: "SET", key: "hijriYear", value: e.target.value })}
                min={1380} max={1460}
              />
              <select
                data-testid="enroll-birth-hijri-month"
                style={iStyle()}
                value={state.hijriMonth}
                onChange={(e) => dispatch({ type: "SET", key: "hijriMonth", value: e.target.value })}
              >
                <option value="">الشهر</option>
                {["محرّم","صفر","ربيع الأول","ربيع الثاني","جمادى الأولى","جمادى الآخرة","رجب","شعبان","رمضان","شوّال","ذو القعدة","ذو الحجّة"].map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                data-testid="enroll-birth-hijri-day"
                style={iStyle()}
                value={state.hijriDay}
                onChange={(e) => dispatch({ type: "SET", key: "hijriDay", value: e.target.value })}
              >
                <option value="">اليوم</option>
                {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ── ولي الأمر ── */}
        <div style={grid2}>
          <label style={labelWrap}>
            <span style={labelText}>{tu("enrollGuardianPhoneLabel")}</span>
            <input
              data-testid="enroll-guardian-phone"
              style={iStyle()}
              value={state.guardianPhone}
              onChange={(e) => dispatch({ type: "SET", key: "guardianPhone", value: e.target.value })}
              placeholder="05xxxxxxxx"
              required
            />
          </label>
          <label style={labelWrap}>
            <span style={labelText}>{tu("enrollGuardianNameOptional")}</span>
            <input
              data-testid="enroll-guardian-name"
              style={iStyle()}
              value={state.guardianName}
              onChange={(e) => dispatch({ type: "SET", key: "guardianName", value: e.target.value })}
            />
          </label>
        </div>

        {/* ── البرنامج ── */}
        <label style={{ ...labelWrap, marginBottom: sp(2) }}>
          <span style={labelText}>{tu("enrollProgramLabel")}</span>
          <select
            data-testid="enroll-program"
            style={iStyle()}
            value={state.programId}
            onChange={(e) => dispatch({ type: "SET", key: "programId", value: e.target.value })}
          >
            {programs.map((p) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}
          </select>
        </label>

        {/* ══ حقول مراقي / قاعدة ══ */}
        {isMaraqi && (
          <>
            {isMaraqiOnly && (
              <div style={grid2}>
                <label style={labelWrap}>
                  <span style={labelText}>{tu("enrollStartSurahLabel")}</span>
                  <select
                    data-testid="enroll-start-surah"
                    style={iStyle()}
                    value={state.startSurah}
                    onChange={(e) => dispatch({ type: "SET_SURAH", surah: parseInt(e.target.value) })}
                  >
                    {SURAH_NAMES.slice(1).map((name, idx) => (
                      <option key={idx + 1} value={idx + 1}>{idx + 1}. {name}</option>
                    ))}
                  </select>
                </label>
                <label style={labelWrap}>
                  <span style={labelText}>{tu("enrollStartAyahLabel")}</span>
                  <select
                    data-testid="enroll-start-ayah"
                    style={iStyle()}
                    value={state.startAyah}
                    onChange={(e) => dispatch({ type: "SET", key: "startAyah", value: parseInt(e.target.value) })}
                  >
                    {Array.from({ length: maxAyah }, (_, i) => i + 1).map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {isMaraqiOnly && (
              <label style={{ ...labelWrap, marginBottom: sp(2) }}>
                <span style={labelText}>{tu("enrollTrackLabel")}</span>
                <select
                  data-testid="enroll-track"
                  style={iStyle()}
                  value={state.trackId}
                  onChange={(e) => dispatch({ type: "SET", key: "trackId", value: e.target.value })}
                >
                  {tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nameAr} ({t.linesPerDay} سطر/يوم){t.id === suggestedTrackId ? ` — ${tu("enrollTrackSuggested")}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div style={{ marginBottom: sp(2) }}>
              <span style={{ ...labelText, display: "block", marginBottom: sp(1) }}>{tu("enrollReadingTestLabel")}</span>
              <div style={{ display: "flex", gap: sp(2) }}>
                {(["PASSED", "FAILED", "DEFER"] as ReadingTestResult[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    data-testid={`enroll-test-${v.toLowerCase()}`}
                    onClick={() => dispatch({ type: "SET", key: "readingTestResult", value: v })}
                    style={{
                      flex: 1, padding: `${sp(1)} ${sp(2)}`,
                      borderRadius: 6, cursor: "pointer", fontFamily: ui.font,
                      fontSize: ui.text.xs,
                      border: `1px solid ${state.readingTestResult === v ? ui.color.goldLine : ui.color.border}`,
                      background: state.readingTestResult === v ? ui.color.soft : ui.color.surface,
                      color: ui.color.text, fontWeight: state.readingTestResult === v ? 700 : 400,
                    }}
                  >
                    {v === "PASSED" ? tu("enrollTestPassed") : v === "FAILED" ? tu("enrollTestFailed") : tu("enrollTestDefer")}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ══ حقول مدّكر ══ */}
        {isMuddakir && (
          <>
            <p style={{ fontSize: ui.text.xs, color: ui.color.muted, marginBottom: sp(2) }}>
              {tu("enrollMuddakirNote")}
            </p>
            <label style={{ ...labelWrap, marginBottom: sp(2) }}>
              <span style={labelText}>{tu("enrollMuddakirTrackLabel")}</span>
              <select
                data-testid="enroll-muddakir-track"
                style={iStyle()}
                value={state.muddakirTrack}
                onChange={(e) => dispatch({ type: "SET", key: "muddakirTrack", value: parseInt(e.target.value) as 1 | 2 | 3 })}
              >
                <option value={1}>{tu("enrollMuddakirTrack1")}</option>
                <option value={2}>{tu("enrollMuddakirTrack2")}</option>
                <option value={3}>{tu("enrollMuddakirTrack3")}</option>
              </select>
            </label>
            <label style={{ ...labelWrap, marginBottom: sp(2) }}>
              <span style={labelText}>{tu("enrollSupervisorLabel")}</span>
              <select
                data-testid="enroll-supervisor"
                style={iStyle()}
                value={state.supervisorId}
                onChange={(e) => dispatch({ type: "SET", key: "supervisorId", value: e.target.value })}
              >
                <option value="">{tu("enrollSupervisorNone")}</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameAr} ({s.currentLoad} {tu("enrollSupervisorLoad")})
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {/* ══ القسم الاختياريّ ══ */}
        <div style={{ marginBottom: sp(2) }}>
          <button
            type="button"
            onClick={() => dispatch({ type: "SET", key: "showOptional", value: !state.showOptional })}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: ui.font, fontSize: ui.text.xs, color: ui.color.muted,
              padding: 0, display: "flex", alignItems: "center", gap: sp(1),
            }}
          >
            {state.showOptional ? "▴" : "▾"} {tu("enrollOptionalSection")}
          </button>
        </div>

        {state.showOptional && (
          <div style={{ ...grid3, marginBottom: sp(2) }}>
            <label style={labelWrap}>
              <span style={labelText}>{tu("enrollSchoolStageLabel")}</span>
              <select
                data-testid="enroll-school-stage"
                style={iStyle()}
                value={state.schoolStage}
                onChange={(e) => dispatch({ type: "SET", key: "schoolStage", value: e.target.value })}
              >
                <option value="">—</option>
                <option value="PRIMARY">ابتدائي</option>
                <option value="INTERMEDIATE">متوسّط</option>
                <option value="SECONDARY">ثانوي</option>
                <option value="UNIVERSITY">جامعيّ</option>
                <option value="OTHER">أخرى</option>
              </select>
            </label>
            <label style={labelWrap}>
              <span style={labelText}>{tu("enrollStudentPhoneLabel")}</span>
              <input
                data-testid="enroll-student-phone"
                style={iStyle()}
                value={state.studentPhone}
                onChange={(e) => dispatch({ type: "SET", key: "studentPhone", value: e.target.value })}
                placeholder="05xxxxxxxx"
              />
            </label>
            <label style={{ ...labelWrap, gridColumn: "1 / -1" }}>
              <span style={labelText}>{tu("enrollNotesLabel")}</span>
              <input
                data-testid="enroll-notes"
                style={iStyle()}
                value={state.notes}
                onChange={(e) => dispatch({ type: "SET", key: "notes", value: e.target.value })}
              />
            </label>
          </div>
        )}

        {err && (
          <p style={{ color: ui.color.danger, fontSize: ui.text.xs, margin: `0 0 ${sp(2)} 0` }}>
            {err}
          </p>
        )}

        <div style={{ display: "flex", gap: sp(2) }}>
          <Button
            data-testid="enroll-submit"
            type="submit"
            variant="primary"
            size="sm"
            disabled={loading}
          >
            {loading ? tu("enrollSavingBtn") : tu("enrollSaveBtn")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {tu("cancelBtn")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
