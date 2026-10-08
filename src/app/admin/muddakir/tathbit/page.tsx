"use client";

import { useCallback, useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import { AppShell, Card, Button, Input, Select, Table, Badge, EmptyState, ui, sp, type Column } from "@/components/ui";
import { tMuddakir } from "@/i18n/ar/muddakir";

// شاشة إعدادات التثبيت (و٤، §٩/§١٢): سلّم التثبيت والإعدادات المحصورة وبنود نقاط المدّكر وسجلّ
// الرفع المبكّر. المدير يُعدّل مباشرةً؛ والإداريّ تُصبح إجراءاته طلباً (الخادم يتفرّع). قراءةٌ للجميع.

type Evt = "MUDDAKIR_DAY_COMPLETE" | "MUDDAKIR_FACE_HEARD" | "MUDDAKIR_STAGE_COMPLETE" | "MUDDAKIR_SHORTFALL";
interface LadderRow { degreeNo: number; dailyJuz: number; khatmaDays: number; khatmaCount: number; active: boolean }
interface PointRow { id: string; nameAr: string; value: number; active: boolean; eventType: Evt }
interface RaiseRow { id: string; studentName: string; fromDegree: number; toDegree: number; atKhatma: number; by: string; createdAt: string }
interface Payload { canManage: boolean; ladder: LadderRow[]; settings: Record<string, unknown>; pointItems: PointRow[]; raises: RaiseRow[] }

// الإعدادات القابلة للتعديل هنا (أعدادٌ صحيحة)؛ البقيّة (مثل tracks) تُعرَض للقراءة.
const EDITABLE_SETTINGS = [
  "weeklySurpriseJuz", "permanentWardJuz", "maxHafizPerSupervisor", "monthlyExcuseLimit",
  "reviewCycleDays", "ribatWindowDays", "weakFaceThreshold", "meetingDay", "stageJuzCount",
] as const;
const EVENTS: Evt[] = ["MUDDAKIR_DAY_COMPLETE", "MUDDAKIR_FACE_HEARD", "MUDDAKIR_STAGE_COMPLETE", "MUDDAKIR_SHORTFALL"];
const evtLabel = (e: Evt): string =>
  tMuddakir(e === "MUDDAKIR_DAY_COMPLETE" ? "evtDayComplete" : e === "MUDDAKIR_FACE_HEARD" ? "evtFaceHeard" : e === "MUDDAKIR_STAGE_COMPLETE" ? "evtStageComplete" : "evtShortfall");

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}
const sectionTitle: React.CSSProperties = { fontSize: ui.text.base, fontWeight: 700, margin: `${sp(5)} 0 ${sp(2)}` };

export default function MuddakirTathbitAdminPage() {
  const { me } = useMe();
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "unauth">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  // مسوّدات التحرير المحلّيّة (معرّف → قيمة).
  const [ladderDraft, setLadderDraft] = useState<Record<number, Partial<LadderRow>>>({});
  const [settingDraft, setSettingDraft] = useState<Record<string, string>>({});
  const [pointDraft, setPointDraft] = useState<Record<string, number>>({});
  const [newPoint, setNewPoint] = useState<{ nameAr: string; value: string; eventType: Evt }>({ nameAr: "", value: "", eventType: "MUDDAKIR_DAY_COMPLETE" });

  const load = useCallback(async () => {
    setStatus("loading"); setMsg(null);
    try {
      const t = await token();
      if (!t) { setStatus("unauth"); return; }
      const res = await fetch("/api/muddakir/admin", { headers: { authorization: `Bearer ${t}` } });
      if (res.status === 401 || res.status === 403) { setStatus("unauth"); return; }
      if (!res.ok) { setStatus("error"); return; }
      setData((await res.json()) as Payload);
      setLadderDraft({}); setSettingDraft({}); setPointDraft({});
      setStatus("ready");
    } catch { setStatus("error"); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(body: Record<string, unknown>) {
    setMsg(null);
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch("/api/muddakir/admin", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify(body) });
    if (res.ok) { setMsg(res.status === 202 ? tMuddakir("savedAsRequest") : tMuddakir("saved")); await load(); }
    else { const j = (await res.json()) as { error?: string }; setMsg(j.error ?? "تعذّر."); }
  }

  if (status === "unauth")
    return (
      <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: sp(3) }}>
        <p>تحتاج دخولًا.</p>
        <a href="/login" style={{ color: ui.color.primary, fontWeight: 600 }}>دخول</a>
      </main>
    );

  const numInput = { width: 72 } as React.CSSProperties;

  const ladderColumns: Column<LadderRow>[] = [
    { key: "degreeNo", header: tMuddakir("ladderDegree"), cell: (d) => arNum(d.degreeNo) },
    { key: "dailyJuz", header: tMuddakir("ladderDailyJuz"), cell: (d) => (
      <Input type="number" min={1} style={numInput} defaultValue={d.dailyJuz} onChange={(e) => setLadderDraft((p) => ({ ...p, [d.degreeNo]: { ...p[d.degreeNo], dailyJuz: Number(e.target.value) } }))} aria-label={tMuddakir("ladderDailyJuz")} />
    ) },
    { key: "khatmaCount", header: tMuddakir("ladderKhatmaCount"), cell: (d) => (
      <Input type="number" min={1} style={numInput} defaultValue={d.khatmaCount} onChange={(e) => setLadderDraft((p) => ({ ...p, [d.degreeNo]: { ...p[d.degreeNo], khatmaCount: Number(e.target.value) } }))} aria-label={tMuddakir("ladderKhatmaCount")} />
    ) },
    { key: "active", header: tMuddakir("ladderActive"), cell: (d) => <Badge tone={d.active ? "success" : "neutral"}>{d.active ? "✓" : "—"}</Badge> },
    { key: "save", header: "", cell: (d) => (
      <span style={{ display: "flex", gap: sp(1) }}>
        <Button type="button" size="sm" disabled={!ladderDraft[d.degreeNo]} onClick={() => void act({ action: "ladder", degreeNo: d.degreeNo, patch: ladderDraft[d.degreeNo] })}>{tMuddakir("save")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => void act({ action: "ladder", degreeNo: d.degreeNo, patch: { active: !d.active } })}>{d.active ? "⊘" : "✓"}</Button>
      </span>
    ) },
  ];

  const raiseColumns: Column<RaiseRow>[] = [
    { key: "studentName", header: tMuddakir("raiseStudent"), cell: (r) => r.studentName },
    { key: "fromTo", header: tMuddakir("raiseFromTo"), cell: (r) => `${arNum(r.fromDegree)} ← ${arNum(r.toDegree)}` },
    { key: "atKhatma", header: tMuddakir("raiseAtKhatma"), cell: (r) => arNum(r.atKhatma) },
    { key: "by", header: tMuddakir("raiseBy"), cell: (r) => r.by },
  ];

  return (
    <AppShell roles={me?.roles ?? []} muddakirStaff={me?.muddakirStaff ?? []} userName={me?.name} activeHref="/admin/muddakir/tathbit"
      title={tMuddakir("tathbitAdminTitle")}
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: tMuddakir("tathbitAdminTitle") }]}>

      {msg && <p style={{ color: ui.color.success, fontSize: ui.text.xs }}>{msg}</p>}
      {status === "loading" && <p style={{ color: ui.color.muted }}>…جارٍ التحميل</p>}
      {status === "error" && <p style={{ color: ui.color.danger }}>تعذّر التحميل. <Button variant="ghost" size="sm" type="button" onClick={() => void load()}>إعادة</Button></p>}

      {status === "ready" && data && (
        <>
          {!data.canManage && <p style={{ color: ui.color.muted, fontSize: ui.text.xs }}>{tMuddakir("readOnlyView")} — {tMuddakir("savedAsRequest")}.</p>}

          {/* سلّم التثبيت */}
          <h2 style={sectionTitle}>{tMuddakir("ladderTitle")}</h2>
          <Table columns={ladderColumns} rows={data.ladder} empty="—" />

          {/* الإعدادات */}
          <h2 style={sectionTitle}>{tMuddakir("settingsTitle")}</h2>
          <Card style={{ padding: sp(3), display: "flex", flexDirection: "column", gap: sp(2) }}>
            {EDITABLE_SETTINGS.map((k) => {
              const cur = data.settings[k];
              const curStr = cur == null ? "" : String(cur);
              return (
                <div key={k} style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ minWidth: 200, fontSize: ui.text.xs, color: ui.color.muted }}>{k}</span>
                  <Input type="number" style={{ width: 96 }} defaultValue={curStr} onChange={(e) => setSettingDraft((p) => ({ ...p, [k]: e.target.value }))} aria-label={k} />
                  <Button type="button" size="sm" disabled={settingDraft[k] === undefined || settingDraft[k] === curStr}
                    onClick={() => void act({ action: "setting", key: k, value: Number(settingDraft[k]) })}>{tMuddakir("save")}</Button>
                </div>
              );
            })}
          </Card>

          {/* بنود النقاط */}
          <h2 style={sectionTitle}>{tMuddakir("pointItemsTitle")}</h2>
          <Card style={{ padding: sp(3), display: "flex", flexDirection: "column", gap: sp(2), marginBottom: sp(2) }}>
            {data.pointItems.map((it) => (
              <div key={it.id} style={{ display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ minWidth: 160 }}><strong>{it.nameAr}</strong> <Badge tone="neutral">{evtLabel(it.eventType)}</Badge></span>
                <Input type="number" style={{ width: 80 }} defaultValue={it.value} onChange={(e) => setPointDraft((p) => ({ ...p, [it.id]: Number(e.target.value) }))} aria-label={tMuddakir("pointItemValue")} />
                <Badge tone={it.active ? "success" : "neutral"}>{it.active ? tMuddakir("pointItemActive") : "—"}</Badge>
                <Button type="button" size="sm" disabled={pointDraft[it.id] === undefined}
                  onClick={() => void act({ action: "pointItem", id: it.id, nameAr: it.nameAr, value: pointDraft[it.id], eventType: it.eventType, active: it.active })}>{tMuddakir("save")}</Button>
              </div>
            ))}
            {data.pointItems.length === 0 && <span style={{ color: ui.color.muted, fontSize: ui.text.xs }}>—</span>}
          </Card>
          {/* إضافة بند */}
          <Card style={{ padding: sp(3), display: "flex", gap: sp(2), alignItems: "center", flexWrap: "wrap" }}>
            <Input placeholder={tMuddakir("pointItemName")} value={newPoint.nameAr} onChange={(e) => setNewPoint((p) => ({ ...p, nameAr: e.target.value }))} style={{ width: "auto", minWidth: 160 }} aria-label={tMuddakir("pointItemName")} />
            <Input type="number" placeholder={tMuddakir("pointItemValue")} value={newPoint.value} onChange={(e) => setNewPoint((p) => ({ ...p, value: e.target.value }))} style={{ width: 96 }} aria-label={tMuddakir("pointItemValue")} />
            <Select value={newPoint.eventType} onChange={(e) => setNewPoint((p) => ({ ...p, eventType: e.target.value as Evt }))} style={{ width: "auto" }} aria-label={tMuddakir("pointItemEvent")}>
              {EVENTS.map((e) => <option key={e} value={e}>{evtLabel(e)}</option>)}
            </Select>
            <Button type="button" size="sm" disabled={!newPoint.nameAr.trim() || !newPoint.value}
              onClick={() => { void act({ action: "pointItem", nameAr: newPoint.nameAr, value: Number(newPoint.value), eventType: newPoint.eventType }); setNewPoint({ nameAr: "", value: "", eventType: "MUDDAKIR_DAY_COMPLETE" }); }}>{tMuddakir("addPointItem")}</Button>
          </Card>

          {/* سجلّ الرفع المبكّر */}
          <h2 style={sectionTitle}>{tMuddakir("raisesTitle")}</h2>
          {data.raises.length === 0 ? <EmptyState title={tMuddakir("noRaises")} /> : <Table columns={raiseColumns} rows={data.raises} empty={tMuddakir("noRaises")} />}
        </>
      )}
    </AppShell>
  );
}
