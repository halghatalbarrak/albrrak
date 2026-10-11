"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Input, Select, Badge, SectionTitle, ui, sp } from "@/components/ui";
import { arNum } from "@/lib/format";
import { tDisplay as t } from "@/i18n/ar/display";

interface ScreenRow { id: string; kind: "MOSQUE" | "HOME"; nameAr: string; studentId: string | null; active: boolean; hasActiveToken: boolean }
interface Program { id: string; nameAr: string }
interface Slide { id: string; ordinal: number; kind: "PROGRAM" | "IMAGE"; durationSec: number; programNameAr: string | null; imageUrl: string | null; active: boolean }
interface Detail extends ScreenRow { slides: Slide[] }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function DisplayAdminPage() {
  const { me } = useMe();
  const [screens, setScreens] = useState<ScreenRow[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "unauth">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [linkOnce, setLinkOnce] = useState<string | null>(null);
  // نموذج إنشاء شاشة
  const [kind, setKind] = useState<"MOSQUE" | "HOME">("MOSQUE");
  const [nameAr, setNameAr] = useState("");
  const [sonQuery, setSonQuery] = useState("");
  const [sonResults, setSonResults] = useState<{ id: string; name: string }[]>([]);
  const [sonId, setSonId] = useState<string | null>(null);
  const [addProg, setAddProg] = useState("");

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const tok = await token();
    if (!tok) { setStatus("unauth"); return null; }
    const res = await fetch(path, { ...init, headers: { ...(init?.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}), authorization: `Bearer ${tok}`, ...(init?.headers ?? {}) } });
    if (res.status === 401 || res.status === 403) { setStatus("unauth"); return null; }
    return res;
  }, []);

  const load = useCallback(async () => {
    setStatus("loading"); setMsg(null);
    const res = await api("/api/admin/display");
    if (!res) return;
    if (!res.ok) { setStatus("error"); return; }
    const j = (await res.json()) as { screens: ScreenRow[]; programs: Program[] };
    setScreens(j.screens); setPrograms(j.programs); setStatus("ready");
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const openDetail = async (id: string) => {
    setLinkOnce(null);
    const res = await api(`/api/admin/display?screenId=${id}`);
    if (res?.ok) setDetail((await res.json() as { detail: Detail }).detail);
  };

  const act = async (body: Record<string, unknown>, ok = t("saved")) => {
    const res = await api("/api/admin/display", { method: "POST", body: JSON.stringify(body) });
    if (!res) return null;
    if (res.ok) { setMsg(ok); await load(); if (detail) await openDetail(detail.id); return res; }
    setMsg(((await res.json()) as { error?: string }).error ?? "تعذّر."); return null;
  };

  const searchSon = async (q: string) => {
    setSonQuery(q); setSonId(null);
    if (q.trim().length < 2) { setSonResults([]); return; }
    const res = await api(`/api/admin/display?students=${encodeURIComponent(q)}`);
    if (res?.ok) setSonResults((await res.json() as { students: { id: string; name: string }[] }).students);
  };

  const create = async () => {
    if (!nameAr.trim() || (kind === "HOME" && !sonId)) { setMsg("أكمل البيانات."); return; }
    const res = await act({ action: "createScreen", kind, nameAr, studentId: kind === "HOME" ? sonId : null }, t("saved"));
    if (res) { setNameAr(""); setSonId(null); setSonQuery(""); setSonResults([]); }
  };

  const genLink = async (screenId: string) => {
    const res = await api("/api/admin/display", { method: "POST", body: JSON.stringify({ action: "issueToken", screenId }) });
    if (res?.ok) { const { token: tk } = (await res.json()) as { token: string }; setLinkOnce(`${window.location.origin}/display/${tk}`); await load(); }
  };

  const uploadFile = async (file: File, extra: Record<string, string>) => {
    const fd = new FormData(); fd.append("file", file); for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    const res = await api("/api/admin/display/upload", { method: "POST", body: fd });
    if (res?.ok) { setMsg(t("saved")); await load(); if (detail) await openDetail(detail.id); }
    else if (res) setMsg(((await res.json()) as { error?: string }).error ?? "تعذّر الرفع.");
  };

  if (status === "unauth")
    return <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}><p>تحتاج دخولًا.</p><a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a></main>;

  return (
    <AppShell roles={me?.roles ?? []} muddakirStaff={me?.muddakirStaff ?? []} userName={me?.name} activeHref="/admin/display"
      title={t("adminTitle")} crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: t("adminTitle") }]}>

      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}

      {/* إنشاء شاشة */}
      <SectionTitle>{t("createScreen")}</SectionTitle>
      <Card style={{ padding: sp(3), display: "flex", flexDirection: "column", gap: sp(2) }}>
        <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" }}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as "MOSQUE" | "HOME")} style={{ width: "auto" }} aria-label={t("createScreen")}>
            <option value="MOSQUE">{t("kindMosque")}</option>
            <option value="HOME">{t("kindHome")}</option>
          </Select>
          <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder={t("screenName")} style={{ width: "auto", minWidth: 180 }} aria-label={t("screenName")} />
          <Button size="sm" onClick={() => void create()}>{t("createScreen")}</Button>
        </div>
        {kind === "HOME" && (
          <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" }}>
            <Input value={sonQuery} onChange={(e) => void searchSon(e.target.value)} placeholder={t("searchStudent")} style={{ width: "auto", minWidth: 200 }} aria-label={t("searchStudent")} />
            {sonResults.length > 0 && (
              <Select value={sonId ?? ""} onChange={(e) => setSonId(e.target.value || null)} style={{ width: "auto", minWidth: 200 }} aria-label={t("linkedSon")}>
                <option value="">— {t("linkedSon")} —</option>
                {sonResults.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </div>
        )}
      </Card>

      {/* قائمة الشاشات */}
      <SectionTitle>{t("screens")}</SectionTitle>
      {screens.length === 0 ? <p style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{t("noScreens")}</p> : screens.map((s) => (
        <Card key={s.id} style={{ padding: sp(3), marginBottom: sp(2), display: "flex", flexDirection: "column", gap: sp(2) }}>
          <div style={{ display: "flex", alignItems: "center", gap: sp(2), flexWrap: "wrap" }}>
            <strong>{s.nameAr}</strong>
            <Badge tone={s.kind === "MOSQUE" ? "primary" : "bronze"}>{s.kind === "MOSQUE" ? t("kindMosque") : t("kindHome")}</Badge>
            <Badge tone={s.hasActiveToken ? "success" : "neutral"}>{s.hasActiveToken ? t("hasLink") : t("noLink")}</Badge>
            <Button size="sm" variant="ghost" onClick={() => void openDetail(s.id)}>{t("slides")}</Button>
            <Button size="sm" onClick={() => void genLink(s.id)}>{s.hasActiveToken ? t("renewLink") : t("genLink")}</Button>
            {s.hasActiveToken && <Button size="sm" variant="ghost" onClick={() => void act({ action: "revokeToken", screenId: s.id })}>{t("revokeLink")}</Button>}
            <label style={{ fontSize: ui.text.xs, color: ui.color.muted, display: "flex", alignItems: "center", gap: 4 }}>
              {s.kind === "MOSQUE" ? t("uploadMosqueBg") : t("uploadHomeBg")}
              <input type="file" accept="image/*,video/mp4" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f, { target: "background", screenKind: s.kind }); }} />
              <span style={{ color: ui.color.primary, cursor: "pointer", fontWeight: 600 }}>⇪</span>
            </label>
          </div>
          {linkOnce && detail?.id === s.id && (
            <div style={{ fontSize: ui.text.xs, background: ui.color.soft, padding: sp(2), borderRadius: ui.radius.md }}>
              <div style={{ color: ui.color.danger, marginBottom: 4 }}>{t("linkShownOnce")}</div>
              <code style={{ wordBreak: "break-all" }}>{linkOnce}</code>
              <Button size="sm" variant="ghost" style={{ marginInlineStart: sp(2) }} onClick={() => void navigator.clipboard?.writeText(linkOnce)}>{t("copy")}</Button>
            </div>
          )}

          {/* تفصيل الشرائح */}
          {detail?.id === s.id && (
            <div style={{ borderTop: `1px solid ${ui.color.border}`, paddingTop: sp(2), display: "flex", flexDirection: "column", gap: sp(2) }}>
              <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" }}>
                <Select value={addProg} onChange={(e) => setAddProg(e.target.value)} style={{ width: "auto" }} aria-label={t("selectProgram")}>
                  <option value="">— {t("selectProgram")} —</option>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.nameAr}</option>)}
                </Select>
                <Button size="sm" disabled={!addProg} onClick={() => { void act({ action: "addProgramSlide", screenId: s.id, programId: addProg }); setAddProg(""); }}>{t("addProgramSlide")}</Button>
                <label style={{ fontSize: ui.text.xs, color: ui.color.primary, cursor: "pointer", fontWeight: 600 }}>
                  {t("addImageSlide")}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f, { target: "slide", screenId: s.id }); }} />
                </label>
              </div>
              {detail.slides.map((sl, i) => (
                <div key={sl.id} style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap", fontSize: ui.text.xs }}>
                  <span>{arNum(i + 1)}.</span>
                  <Badge tone="neutral">{sl.kind === "PROGRAM" ? t("programSlide") : t("imageSlide")}</Badge>
                  <span>{sl.programNameAr ?? (sl.imageUrl ? "🖼" : "")}</span>
                  <Input type="number" defaultValue={sl.durationSec} style={{ width: 72 }} onBlur={(e) => { const v = Number(e.target.value); if (v && v !== sl.durationSec) void act({ action: "setSlide", slideId: sl.id, durationSec: v }); }} aria-label={t("durationSec")} />
                  <Badge tone={sl.active ? "success" : "neutral"}>{sl.active ? t("activeLabel") : "—"}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => void act({ action: "setSlide", slideId: sl.id, active: !sl.active })}>{sl.active ? t("disable") : t("enable")}</Button>
                  <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => { const ids = detail.slides.map((x) => x.id); [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; void act({ action: "reorder", screenId: s.id, orderedIds: ids }); }}>{t("moveUp")}</Button>
                  <Button size="sm" variant="ghost" disabled={i === detail.slides.length - 1} onClick={() => { const ids = detail.slides.map((x) => x.id); [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; void act({ action: "reorder", screenId: s.id, orderedIds: ids }); }}>{t("moveDown")}</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </AppShell>
  );
}
