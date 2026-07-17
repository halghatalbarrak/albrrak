"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

interface Row {
  id: string;
  name: string;
  age: number | null;
  state: string;
  circle: string | null;
  guardian: string | null;
  pendingPlacementId: string | null;
}
interface Circle {
  id: string;
  nameAr: string;
  programKey: string;
}

// تسميات الحالات (StudentState) — عرضٌ عربيّ، لا قاعدة عمل.
const STATE_AR: Record<string, string> = {
  APPLIED: "مُقدَّم",
  PENDING_ACCEPTANCE: "بانتظار القبول",
  WAITLISTED: "قائمة الانتظار",
  REJECTED: "مرفوض",
  AWAITING_READING_TEST: "بانتظار اختبار القراءة",
  IN_QAIDAH: "في القاعدة المدنية",
  AWAITING_PACE_TEST: "بانتظار اختبار المقطع",
  PACE_RETEST_SCHEDULED: "إعادة اختبار المقطع",
  IN_MARAQI: "في المراقي",
  COMPLETED: "أتمّ",
  WITHDRAWN: "منسحب",
};

const box: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "1.5rem",
  fontFamily: "system-ui, sans-serif",
};
const card: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 8,
  padding: "0.75rem 1rem",
  marginBottom: 10,
};
const input: React.CSSProperties = { padding: "0.4rem", fontSize: "1rem", fontFamily: "inherit" };
const btn: React.CSSProperties = { padding: "0.4rem 0.8rem", cursor: "pointer", marginInlineStart: 6 };

async function token(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

function ReadingTestForm({
  studentId,
  qaidahCircles,
  onDone,
}: {
  studentId: string;
  qaidahCircles: Circle[];
  onDone: () => void;
}) {
  const [fluent, setFluent] = useState(false);
  const [notes, setNotes] = useState("");
  const [circleId, setCircleId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErr(null);
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/students/${studentId}/reading-test`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ readsFluently: fluent, notes, circleId: fluent ? undefined : circleId }),
    });
    setBusy(false);
    if (res.status === 201) onDone();
    else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? "تعذّر تسجيل الاختبار.");
    }
  }

  return (
    <div style={{ marginTop: 8, background: "#fafafa", padding: "0.5rem 0.75rem", borderRadius: 6 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>تسجيل اختبار القراءة</div>
      <label style={{ display: "block", marginBottom: 6 }}>
        <input type="checkbox" checked={fluent} onChange={(e) => setFluent(e.target.checked)} /> يجيد القراءة نظراً
        <span style={{ opacity: 0.7 }}> ({fluent ? "← بانتظار اختبار المقطع" : "← القاعدة المدنية + حلقة"})</span>
      </label>
      {!fluent && (
        <select style={{ ...input, display: "block", marginBottom: 6 }} value={circleId} onChange={(e) => setCircleId(e.target.value)}>
          <option value="">اختر حلقة القاعدة المدنية…</option>
          {qaidahCircles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameAr}
            </option>
          ))}
        </select>
      )}
      <textarea
        style={{ ...input, display: "block", width: "100%", minHeight: 48, marginBottom: 6 }}
        placeholder="ملاحظات المختبر…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {err && <p style={{ color: "#b00020", margin: "4px 0" }}>{err}</p>}
      <button style={btn} disabled={busy || !notes.trim() || (!fluent && !circleId)} onClick={() => void submit()}>
        {busy ? "…" : "رفع القرار للاعتماد"}
      </button>
    </div>
  );
}

export default function AdminStudentsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const t = await token();
    if (!t) {
      window.location.href = "/login";
      return;
    }
    const auth = { authorization: `Bearer ${t}` };
    try {
      const [meRes, stRes, ciRes] = await Promise.all([
        fetch("/api/me", { headers: auth }),
        fetch("/api/admin/students", { headers: auth }),
        fetch("/api/admin/circles", { headers: auth }),
      ]);
      if (meRes.ok) {
        const data = (await meRes.json().catch(() => ({}))) as { roles?: string[] };
        setRoles(Array.isArray(data.roles) ? data.roles : []);
      }
      if (stRes.status === 403) {
        setErr("لا صلاحية — هذه الشاشة للكادر الإداري.");
        return;
      }
      if (!stRes.ok) {
        setErr("تعذّر جلب الطلاب.");
        return;
      }
      const data = (await stRes.json().catch(() => ({}))) as { students?: Row[] };
      setRows(Array.isArray(data.students) ? data.students : []);
      if (ciRes.ok) {
        const cd = (await ciRes.json().catch(() => ({}))) as { circles?: Circle[] };
        setCircles(Array.isArray(cd.circles) ? cd.circles : []);
      }
    } catch {
      setErr("تعذّر الاتصال بالخادم.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revealId(id: string) {
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/students/${id}/reveal-id`, {
      method: "POST",
      headers: { authorization: `Bearer ${t}` },
    });
    if (res.ok) {
      const { nationalId } = (await res.json()) as { nationalId: string };
      setRevealed((r) => ({ ...r, [id]: nationalId }));
    } else {
      setErr("تعذّر كشف رقم الهوية.");
    }
  }

  async function decide(approvalId: string, decision: "APPROVED" | "REJECTED") {
    const t = await token();
    if (!t) return;
    let note: string | undefined;
    if (decision === "REJECTED") {
      note = window.prompt("سبب الرفض (إلزامي):") ?? "";
      if (!note.trim()) return;
    }
    const res = await fetch(`/api/placements/${approvalId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ decision, note }),
    });
    if (res.ok) void load();
    else setErr("تعذّر تنفيذ القرار.");
  }

  const canReveal = roles.includes("REGISTRAR") || roles.includes("SUPER_ADMIN");
  const canRecord = roles.includes("REGISTRAR") || roles.includes("SUPER_ADMIN");
  const canApprove = roles.includes("CIRCLE_MANAGER") || roles.includes("SUPER_ADMIN");
  const qaidahCircles = circles.filter((c) => c.programKey === "QAIDAH_MADANIYYAH");

  if (err && !rows) return <main style={box}>{err}</main>;
  if (!rows) return <main style={box}>جارٍ التحميل…</main>;

  return (
    <main style={box}>
      <h1>الطلاب المقبولون ({rows.length})</h1>
      {err && <p style={{ color: "#b00020" }}>{err}</p>}
      {rows.length === 0 && <p>لا طلاب مقبولون بعد.</p>}
      {rows.map((r) => (
        <div key={r.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
            <strong>{r.name}</strong>
            <span style={{ opacity: 0.7 }}>{STATE_AR[r.state] ?? r.state}</span>
          </div>
          <div style={{ fontSize: "0.9rem", opacity: 0.85, marginTop: 4 }}>
            {r.age != null ? `العمر ${r.age}` : "العمر —"}
            {` • الحلقة ${r.circle ?? "لم تُسنَد"}`}
            {` • ولي الأمر ${r.guardian ?? "—"}`}
          </div>

          {r.pendingPlacementId && canApprove && (
            <div style={{ marginTop: 8 }}>
              <span style={{ color: "#8a6d00", marginInlineEnd: 8 }}>قرار تحديدٍ بانتظار اعتمادك:</span>
              <button style={btn} onClick={() => decide(r.pendingPlacementId as string, "APPROVED")}>
                اعتمِد
              </button>
              <button style={btn} onClick={() => decide(r.pendingPlacementId as string, "REJECTED")}>
                ارفض بسبب
              </button>
            </div>
          )}

          {r.state === "AWAITING_READING_TEST" && !r.pendingPlacementId && canRecord && (
            <ReadingTestForm studentId={r.id} qaidahCircles={qaidahCircles} onDone={() => void load()} />
          )}

          {canReveal && (
            <div style={{ marginTop: 8 }}>
              <button style={btn} onClick={() => revealId(r.id)}>
                {revealed[r.id] ? `الهوية: ${revealed[r.id]}` : "كشف رقم الهوية"}
              </button>
            </div>
          )}
        </div>
      ))}
    </main>
  );
}
