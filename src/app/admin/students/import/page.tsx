"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import { IMPORT_COLUMNS } from "@/lib/student-import-columns";
import { AppShell, Button, Select, Table, ui, sp, type Column } from "@/components/ui";
import { tStudentImport as t, type StudentImportKey } from "@/i18n/ar/student-import";

interface Ref { id: string; nameAr: string }
interface Circle { id: string; nameAr: string; programKey: string }
type IssueCode = string;
interface Issue { code: IssueCode; level: "warning" | "error"; column?: string }
interface PreviewRow { index: number; level: "valid" | "warning" | "error" | "skip"; issues: Issue[]; name: string; maskedId: string; skip: boolean }
type Override = { nationalityId?: string; guardianRelationId?: string; emergencyRelationId?: string };
interface Outcome { index: number; name: string; maskedId: string; ok: boolean; reasonKey?: string }
interface Report { successCount: number; failCount: number; outcomes: Outcome[] }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

// علّة ← مفتاح نصٍّ في القاموس.
const ISSUE_KEY: Record<string, StudentImportKey> = {
  idNot10: "issueIdNot10",
  nationalityUnmatched: "issueNationalityUnmatched",
  relationUnmatched: "issueRelationUnmatched",
  emergencyRelationUnmatched: "issueEmergencyRelationUnmatched",
  missingName: "issueMissingName",
  missingNationality: "issueMissingNationality",
  missingBirthDate: "issueMissingBirthDate",
  badBirthDate: "issueBadBirthDate",
  missingStudentGender: "issueMissingStudentGender",
  badStudentGender: "issueBadStudentGender",
  missingGuardianGender: "issueMissingGuardianGender",
  badGuardianGender: "issueBadGuardianGender",
  missingGuardianRelation: "issueMissingGuardianRelation",
  missingGuardianPhone: "issueMissingGuardianPhone",
  teenNeedsPhone: "issueTeenNeedsPhone",
  dupInFile: "issueDupInFile",
  alreadyStudent: "issueAlreadyStudent",
  alreadyPending: "issueAlreadyPending",
};
const REASON_KEY: Record<string, StudentImportKey> = {
  importRowFailed: "reasonImportRowFailed",
  rowInvalid: "reasonRowInvalid",
  studentAlreadyInThisCircle: "reasonStudentAlreadyInThisCircle",
  studentThirteenNeedsPhone: "reasonStudentThirteenNeedsPhone",
};
const issueText = (c: string): string => (ISSUE_KEY[c] ? t(ISSUE_KEY[c]) : c);
const reasonText = (k?: string): string => (k && REASON_KEY[k] ? t(REASON_KEY[k]) : t("reasonImportRowFailed"));

export default function StudentImportPage() {
  const { me } = useMe();
  const isSuper = (me?.roles ?? []).includes("SUPER_ADMIN");

  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleId, setCircleId] = useState("");
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [refs, setRefs] = useState<{ nationalities: Ref[]; guardianRelations: Ref[] }>({ nationalities: [], guardianRelations: [] });
  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "commit">("");

  const loadCircles = useCallback(async () => {
    const tok = await token();
    if (!tok) { window.location.href = "/login"; return; }
    const res = await fetch("/api/admin/circles", { headers: { authorization: `Bearer ${tok}` } });
    if (!res.ok) { setErr(t("errLoad")); return; }
    const data = (await res.json().catch(() => null)) as { circles?: Circle[] } | null;
    setCircles((data?.circles ?? []).filter((c) => c.programKey === "MARAQI"));
  }, []);

  useEffect(() => { if (isSuper) void loadCircles(); }, [isSuper, loadCircles]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setReport(null); setRows(null); setOverrides({}); setErr(null);
    if (!f) { setCsv(null); setFileName(""); return; }
    setCsv(await f.text());
    setFileName(f.name);
  }

  const runPreview = useCallback(async (ov: Record<number, Override>) => {
    if (!csv) { setErr(t("errNoFile")); return; }
    setBusy("preview"); setErr(null); setReport(null);
    try {
      const tok = await token();
      if (!tok) { window.location.href = "/login"; return; }
      const res = await fetch("/api/admin/students/import/preview", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
        body: JSON.stringify({ csv, overrides: ov }),
      });
      if (res.status === 403) { setErr(t("errForbidden")); return; }
      const data = (await res.json().catch(() => null)) as
        | { ok: true; results: PreviewRow[]; references: { nationalities: Ref[]; guardianRelations: Ref[] } }
        | { ok: false; missingColumns: string[] } | null;
      if (!data) { setErr(t("errParse")); return; }
      if (!data.ok) { setErr(`${t("errMissingColumns")} ${data.missingColumns.join("، ")}`); setRows(null); return; }
      setRows(data.results); setRefs(data.references);
    } finally { setBusy(""); }
  }, [csv]);

  function setOverride(index: number, patch: Override) {
    const next = { ...overrides, [index]: { ...overrides[index], ...patch } };
    setOverrides(next);
    void runPreview(next);
  }

  async function commit() {
    if (!circleId) { setErr(t("errNoCircle")); return; }
    if (!csv) { setErr(t("errNoFile")); return; }
    setBusy("commit"); setErr(null);
    try {
      const tok = await token();
      if (!tok) { window.location.href = "/login"; return; }
      const res = await fetch("/api/admin/students/import/commit", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
        body: JSON.stringify({ csv, circleId, overrides }),
      });
      const data = (await res.json().catch(() => null)) as (Report & { error?: string }) | { error: string } | null;
      if (!res.ok || !data || !("outcomes" in data)) {
        setErr((data && "error" in data && data.error) ? data.error : t("errNoValidRows"));
        return;
      }
      setReport(data);
      void runPreview(overrides); // يُحدِّث المعاينة (تظهر التكرارات المحفوظة الآن مكرّرةً في القاعدة)
    } finally { setBusy(""); }
  }

  function downloadTemplate() {
    const header = IMPORT_COLUMNS.map((c) => c.ar).join(",");
    const blob = new Blob(["﻿" + header + "\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "student-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const summary = useMemo(() => {
    const s = { valid: 0, warning: 0, error: 0, skip: 0 };
    for (const r of rows ?? []) s[r.level] += 1;
    return s;
  }, [rows]);

  const toneColor = (lvl: PreviewRow["level"]) => (lvl === "error" ? ui.color.danger : lvl === "warning" ? "#b8860b" : lvl === "skip" ? ui.color.muted : ui.color.success);
  const statusText = (lvl: PreviewRow["level"]) => t(lvl === "error" ? "statusError" : lvl === "warning" ? "statusWarning" : lvl === "skip" ? "statusSkip" : "statusValid");

  const columns: Column<PreviewRow>[] = [
    { key: "index", header: t("colRow"), cell: (r) => arNum(r.index) },
    { key: "name", header: t("colName"), cell: (r) => r.name || "—" },
    { key: "id", header: t("colId"), cell: (r) => (r.maskedId ? arNum(r.maskedId) : "—") },
    { key: "status", header: t("colStatus"), cell: (r) => <span style={{ color: toneColor(r.level), fontWeight: 600 }}>{statusText(r.level)}</span> },
    {
      key: "reason", header: t("colReason"), cell: (r) => {
        const needNat = r.issues.some((i) => i.code === "nationalityUnmatched" || i.code === "missingNationality");
        const needRel = r.issues.some((i) => i.code === "relationUnmatched" || i.code === "missingGuardianRelation");
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: sp(1) }}>
            {r.issues.map((i, k) => <span key={k} style={{ color: toneColor(i.level), fontSize: ui.text.xs }}>{issueText(i.code)}</span>)}
            {needNat && (
              <Select value={overrides[r.index]?.nationalityId ?? ""} onChange={(e) => setOverride(r.index, { nationalityId: e.target.value })} aria-label={t("fixNationality")}>
                <option value="">{t("fixPick")}</option>
                {refs.nationalities.map((n) => <option key={n.id} value={n.id}>{n.nameAr}</option>)}
              </Select>
            )}
            {needRel && (
              <Select value={overrides[r.index]?.guardianRelationId ?? ""} onChange={(e) => setOverride(r.index, { guardianRelationId: e.target.value })} aria-label={t("fixRelation")}>
                <option value="">{t("fixPick")}</option>
                {refs.guardianRelations.map((x) => <option key={x.id} value={x.id}>{x.nameAr}</option>)}
              </Select>
            )}
          </div>
        );
      },
    },
  ];

  const reportColumns: Column<Outcome>[] = [
    { key: "index", header: t("colRow"), cell: (o) => arNum(o.index) },
    { key: "name", header: t("colName"), cell: (o) => o.name || "—" },
    { key: "id", header: t("colId"), cell: (o) => (o.maskedId ? arNum(o.maskedId) : "—") },
    { key: "res", header: t("colStatus"), cell: (o) => <span style={{ color: o.ok ? ui.color.success : ui.color.danger, fontWeight: 600 }}>{o.ok ? t("outcomeOk") : t("outcomeFail")}</span> },
    { key: "reason", header: t("colReason"), cell: (o) => (o.ok ? "—" : reasonText(o.reasonKey)) },
  ];

  const committable = (rows ?? []).filter((r) => r.level === "valid" || r.level === "warning").length;

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/students/import"
      title={t("title")} crumbs={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbAdmin") }, { label: t("crumbStudents"), href: "/admin/students" }, { label: t("crumbImport") }]}>

      {!me && <p style={{ color: ui.color.muted }}>…</p>}
      {me && !isSuper && <p style={{ color: ui.color.danger }}>{t("errForbidden")}</p>}

      {isSuper && (
        <>
          <p style={{ color: ui.color.muted }}>{t("intro")}</p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: sp(4), alignItems: "flex-end", marginBottom: sp(5) }}>
            <label style={{ display: "flex", flexDirection: "column", gap: sp(1) }}>
              <span style={{ fontSize: ui.text.xs, fontWeight: 600 }}>{t("fieldProgram")}</span>
              <span style={{ fontWeight: 700 }}>مراقي</span>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: sp(1), minWidth: 220 }}>
              <span style={{ fontSize: ui.text.xs, fontWeight: 600 }}>{t("fieldCircle")}</span>
              <Select value={circleId} onChange={(e) => setCircleId(e.target.value)}>
                <option value="">{t("selectCircle")}</option>
                {circles.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
              </Select>
              {circles.length === 0 && <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{t("noCircles")}</span>}
            </label>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: sp(3), alignItems: "center", marginBottom: sp(4) }}>
            <input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e)} aria-label={t("fieldFile")} />
            <Button variant="ghost" size="sm" onClick={downloadTemplate}>{t("downloadTemplate")}</Button>
            <Button onClick={() => void runPreview(overrides)} disabled={!csv || busy !== ""}>
              {busy === "preview" ? t("parsing") : t("previewBtn")}
            </Button>
          </div>
          <p style={{ fontSize: ui.text.xs, color: ui.color.muted, marginTop: 0 }}>{t("templateHint")}</p>
          {fileName && <p style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{fileName}</p>}

          {err && <p style={{ color: ui.color.danger }}>{err}</p>}

          {rows && (
            <section style={{ marginTop: sp(5) }}>
              <h2 style={{ fontSize: ui.text.lg, fontWeight: 700 }}>{t("previewTitle")}</h2>
              <p style={{ fontSize: ui.text.xs }}>
                <span style={{ color: ui.color.success }}>{t("summaryValid")}: {arNum(summary.valid)}</span>{"  ·  "}
                <span style={{ color: "#b8860b" }}>{t("summaryWarning")}: {arNum(summary.warning)}</span>{"  ·  "}
                <span style={{ color: ui.color.danger }}>{t("summaryError")}: {arNum(summary.error)}</span>{"  ·  "}
                <span style={{ color: ui.color.muted }}>{t("summarySkip")}: {arNum(summary.skip)}</span>
              </p>
              {summary.skip > 0 && (
                <p style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{t("skipNoticePrefix")} {arNum(summary.skip)} {t("skipNoticeReason")}</p>
              )}
              <Table columns={columns} rows={rows} empty="—" />
              <div style={{ marginTop: sp(4) }}>
                <Button onClick={() => void commit()} disabled={!circleId || committable === 0 || busy !== ""}>
                  {busy === "commit" ? t("committing") : `${t("commitBtn")} (${arNum(committable)})`}
                </Button>
              </div>
            </section>
          )}

          {report && (
            <section style={{ marginTop: sp(6) }}>
              <h2 style={{ fontSize: ui.text.lg, fontWeight: 700 }}>{t("reportTitle")}</h2>
              <p style={{ fontSize: ui.text.xs }}>
                <span style={{ color: ui.color.success }}>{t("reportSuccess")}: {arNum(report.successCount)}</span>{"  ·  "}
                <span style={{ color: ui.color.danger }}>{t("reportFail")}: {arNum(report.failCount)}</span>
              </p>
              <Table columns={reportColumns} rows={report.outcomes} empty="—" />
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
