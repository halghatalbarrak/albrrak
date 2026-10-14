"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import {
  AppShell, Button, Input, Select, Field, Badge, Table, Stat, ui, sp, type Column,
} from "@/components/ui";
import { tGrantPoints } from "@/i18n/ar/grant-points";

interface GrantItem { id: string; nameAr: string; value: number; grantSource: string }
interface GrantStudent { studentId: string; name: string; circleName: string }
interface LedgerRow { id: string; itemName: string; amount: number; grantedByName: string | null; note: string | null; createdAt: string }
interface Ledger { balance: number; transactions: LedgerRow[] }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function GrantPointsPage() {
  const { me } = useMe();
  const [items, setItems] = useState<GrantItem[]>([]);
  const [students, setStudents] = useState<GrantStudent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [studentId, setStudentId] = useState("");
  const [itemId, setItemId] = useState("");
  const [note, setNote] = useState("");
  const [ledger, setLedger] = useState<Ledger | null>(null);

  const load = useCallback(async () => {
    const t = await token();
    if (!t) { window.location.href = "/login"; return; }
    const res = await fetch("/api/economy/grant", { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) { setErr(tGrantPoints("errForbidden")); return; }
    if (!res.ok) { setErr(tGrantPoints("errLoadData")); return; }
    const data = (await res.json()) as { items: GrantItem[]; students: GrantStudent[] };
    setItems(data.items); setStudents(data.students);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadLedger = useCallback(async (sid: string) => {
    setLedger(null);
    if (!sid) return;
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/economy/grant?studentId=${encodeURIComponent(sid)}`, { headers: { authorization: `Bearer ${t}` } });
    if (res.ok) setLedger((await res.json()) as Ledger);
  }, []);

  useEffect(() => { void loadLedger(studentId); }, [studentId, loadLedger]);

  async function grant() {
    setErr(null); setOk(null);
    if (!studentId || !itemId) { setErr(tGrantPoints("errSelectStudentAndItem")); return; }
    const t = await token();
    if (!t) return;
    const res = await fetch("/api/economy/grant", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ studentId, pointItemId: itemId, note: note.trim() || undefined }),
    });
    if (res.ok) {
      setOk(tGrantPoints("okGranted")); setItemId(""); setNote("");
      void loadLedger(studentId);
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? tGrantPoints("errGrant"));
    }
  }

  const cols: Column<LedgerRow>[] = [
    { key: "item", header: tGrantPoints("colItem"), cell: (r) => <span>{r.itemName}</span> },
    { key: "amount", header: tGrantPoints("colPoints"), cell: (r) => (
      <Badge tone={r.amount >= 0 ? "success" : "danger"}>{r.amount >= 0 ? "+" : "−"}{arNum(Math.abs(r.amount))}</Badge>
    ) },
    { key: "by", header: tGrantPoints("colBy"), cell: (r) => <span style={{ color: ui.color.muted }}>{r.grantedByName ?? tGrantPoints("bySystem")}</span> },
    { key: "note", header: tGrantPoints("colNote"), cell: (r) => <span style={{ color: ui.color.muted }}>{r.note ?? "—"}</span> },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/grant-points"
      title={tGrantPoints("title")} crumbs={[{ label: tGrantPoints("crumbHome"), href: "/" }, { label: tGrantPoints("crumbOperation") }, { label: tGrantPoints("crumbGrantPoints") }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {ok && <p style={{ color: ui.color.success }}>{ok}</p>}

      <p style={{ color: ui.color.muted }}>{tGrantPoints("intro")}</p>

      <section style={{ background: ui.color.surface, border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.lg, padding: sp(4), marginBottom: sp(6) }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp(3) }}>
          <Field label={tGrantPoints("fieldStudent")}>
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">{tGrantPoints("studentPlaceholder")}</option>
              {students.map((s) => <option key={s.studentId} value={s.studentId}>{s.name} — {s.circleName}</option>)}
            </Select>
          </Field>
          <Field label={tGrantPoints("fieldItem")}>
            <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">{tGrantPoints("itemPlaceholder")}</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.nameAr} ({i.value >= 0 ? "+" : "−"}{arNum(Math.abs(i.value))})</option>)}
            </Select>
          </Field>
          <Field label={tGrantPoints("fieldNote")}><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tGrantPoints("notePlaceholder")} /></Field>
        </div>
        <div style={{ marginTop: sp(3) }}>
          <Button onClick={() => void grant()}>{tGrantPoints("grantBtn")}</Button>
        </div>
      </section>

      {studentId && ledger && (
        <section>
          <div style={{ marginBottom: sp(4) }}>
            <Stat label={tGrantPoints("statCurrentBalance")} value={arNum(ledger.balance)} />
          </div>
          <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(2) }}>{tGrantPoints("recentTransactions")}</h2>
          <Table columns={cols} rows={ledger.transactions} empty={tGrantPoints("emptyTransactions")} />
        </section>
      )}
    </AppShell>
  );
}
