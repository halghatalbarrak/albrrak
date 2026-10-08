"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { ui, sp, Button, Card, Input, Badge } from "@/components/ui";
import { tMuddakir as t, stageLabel } from "@/i18n/ar/muddakir";

// شاشة المختبِر (المرحلة ٧، §٧) — للجوّال أوّلاً. المختبِر (RECITER) يرى الحفّاظ الجاهزين للسرد،
// يسجّل النتيجة (اجتاز/لم يجتز) ومواضع الأخطاء (الصفحة+السطر) فتدخل علاج الأخطاء. محميٌّ في الخادم.

interface Candidate { studentId: string; name: string; stage: number; kind: "STAGE" | "FINAL" | "TATHBIT_FINAL" }
interface ErrPos { page: string; lineNo: string }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function MuddakirRecitationPage() {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unauth" | "error">("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [sel, setSel] = useState<Candidate | null>(null);
  const [errs, setErrs] = useState<ErrPos[]>([]);

  const load = useCallback(async () => {
    setSel(null); setErrs([]); setMsg(null);
    try {
      const tok = await token();
      if (!tok) { setStatus("unauth"); return; }
      const res = await fetch("/api/muddakir/recitation", { headers: { authorization: `Bearer ${tok}` } });
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      setCandidates(((await res.json()) as { candidates: Candidate[] }).candidates);
      setStatus("ready");
    } catch { setStatus("error"); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = useCallback(async (passed: boolean) => {
    if (!sel) return;
    setMsg(null);
    const tok = await token();
    if (!tok) { setStatus("unauth"); return; }
    const errors = errs
      .filter((e) => e.page && e.lineNo)
      .map((e) => ({ page: Number(e.page), lineNo: Number(e.lineNo) }));
    const res = await fetch("/api/muddakir/recitation", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ studentId: sel.studentId, passed, errors }),
    });
    if (res.ok) { setMsg(t("resultRecorded")); await load(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر."); }
  }, [sel, errs, load]);

  if (status === "unauth")
    return <Center><p>{t("examinerTitle")} — {t("roleExaminer")}</p><a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a></Center>;
  if (status === "loading") return <Center><p style={{ color: ui.color.muted }}>…جارٍ التحميل</p></Center>;
  if (status === "error") return <Center><p style={{ color: ui.color.danger }}>تعذّر التحميل.</p><Button size="sm" onClick={() => void load()}>إعادة</Button></Center>;

  return (
    <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, maxWidth: 520, margin: "0 auto", padding: sp(3), display: "flex", flexDirection: "column", gap: sp(3) }}>
      <h1 style={{ fontSize: ui.text.lg, fontWeight: 800, margin: 0 }}>{t("examinerTitle")}</h1>
      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}

      {!sel ? (
        (candidates ?? []).length === 0 ? <p style={{ color: ui.color.muted }}>{t("noCandidates")}</p>
          : (candidates ?? []).map((c) => (
            <Card key={c.studentId} style={{ padding: sp(3), display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(2) }}>
              <div>
                <strong>{c.name}</strong>
                <span style={{ color: ui.color.muted, fontSize: ui.text.xs, marginRight: sp(2) }}>
                  {c.kind === "TATHBIT_FINAL" ? t("tathbitFinalRecitation") : c.kind === "FINAL" ? t("finalRecitation") : `${stageLabel(c.stage)} · ${t("stageRecitationWord")}`}
                </span>
              </div>
              <Button size="sm" onClick={() => { setSel(c); setErrs([]); }}>{t("openExaminer")}</Button>
            </Card>
          ))
      ) : (
        <>
          <Button variant="ghost" size="sm" style={{ alignSelf: "flex-start" }} onClick={() => setSel(null)}>← {t("backToList")}</Button>
          <Card style={{ padding: sp(3) }}>
            <strong style={{ fontSize: ui.text.base }}>{sel.name}</strong>
            <div style={{ marginTop: sp(1) }}>
              <Badge tone="bronze">{sel.kind === "TATHBIT_FINAL" ? t("tathbitFinalRecitation") : sel.kind === "FINAL" ? t("finalRecitation") : `${stageLabel(sel.stage)} · ${t("stageRecitationWord")}`}</Badge>
            </div>
          </Card>

          <Card style={{ padding: sp(3) }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: sp(2) }}>
              <strong style={{ fontSize: ui.text.xs }}>{t("errorsTitle")}</strong>
              <Button variant="ghost" size="sm" onClick={() => setErrs((p) => [...p, { page: "", lineNo: "" }])}>{t("addErrorPos")}</Button>
            </div>
            {errs.length === 0 ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs }}>—</p> : errs.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: sp(2), alignItems: "center", marginBottom: sp(2) }}>
                <Input inputMode="numeric" placeholder={t("pageWord")} value={e.page} onChange={(ev) => setErrs((p) => p.map((x, j) => j === i ? { ...x, page: ev.target.value } : x))} style={{ width: 90 }} />
                <Input inputMode="numeric" placeholder={t("lineWord")} value={e.lineNo} onChange={(ev) => setErrs((p) => p.map((x, j) => j === i ? { ...x, lineNo: ev.target.value } : x))} style={{ width: 90 }} />
                <Button variant="ghost" size="sm" onClick={() => setErrs((p) => p.filter((_, j) => j !== i))}>×</Button>
              </div>
            ))}
          </Card>

          <div style={{ display: "flex", gap: sp(2) }}>
            <Button variant="danger" onClick={() => void submit(false)}>{t("resultFailed")}</Button>
            <Button style={{ marginRight: "auto" }} onClick={() => void submit(true)}>{t("resultPassed")}</Button>
          </div>
        </>
      )}
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>{children}</main>;
}
