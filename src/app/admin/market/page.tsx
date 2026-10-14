"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { arNum } from "@/lib/format";
import {
  AppShell, Button, Input, Field, Badge, Table, ui, sp, type Column,
} from "@/components/ui";
import { tMarket as t } from "@/i18n/ar/market";
import { type Item } from "./shared";

interface PendingGift {
  id: string;
  nameAr: string;
  imageUrl: string | null;
  proposedPricePoints: number | null;
  targetStudentName: string | null; // null = عامّة
  proposedByName: string | null;
}

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function AdminMarketPage() {
  const { me } = useMe();
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [gifts, setGifts] = useState<PendingGift[]>([]);
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const tok = await token();
    if (!tok) { window.location.href = "/login"; return; }
    const res = await fetch("/api/admin/market", { headers: { authorization: `Bearer ${tok}` } });
    if (res.status === 403) { setErr(t("errNoPermission")); return; }
    if (!res.ok) { setErr(t("errFetchItems")); return; }
    const data = (await res.json().catch(() => null)) as { items?: Item[] } | null;
    setItems(data?.items ?? []);
    // ثمرات الوليّ المعلّقة (م٦ب-٢).
    const gres = await fetch("/api/admin/market/gifts", { headers: { authorization: `Bearer ${tok}` } });
    if (gres.ok) setGifts(((await gres.json()) as { gifts: PendingGift[] }).gifts);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decideGift(id: string, action: "approve" | "reject") {
    const tok = await token();
    if (!tok) return;
    const body: Record<string, unknown> = { id, action };
    if (action === "approve") {
      const raw = priceEdits[id];
      const g = gifts.find((x) => x.id === id);
      body.pricePoints = raw != null && raw.trim() !== "" ? Number(raw) : g?.proposedPricePoints ?? NaN;
    }
    const res = await fetch("/api/admin/market/gifts", {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify(body),
    });
    if (res.ok) { setErr(null); void load(); }
    else { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(j.error ?? t("errDoAction")); }
  }

  async function toggle(item: Item) {
    const tok = await token();
    if (!tok) return;
    const res = await fetch("/api/admin/market", {
      method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ id: item.id, active: !item.active }),
    });
    if (res.ok) void load();
    else setErr(t("errToggleState"));
  }

  const cols: Column<Item>[] = [
    { key: "name", header: t("colName"), cell: (i) => (
      <span style={{ display: "flex", gap: sp(2), alignItems: "center", opacity: i.active ? 1 : 0.5 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {i.imageUrl && <img src={i.imageUrl} alt="" width={32} height={32} style={{ borderRadius: ui.radius.sm, objectFit: "cover" }} />}
        {i.nameAr}
      </span>
    ) },
    { key: "price", header: t("colPrice"), cell: (i) => <Badge tone="bronze">{arNum(i.pricePoints)} {t("pointUnit")}</Badge> },
    { key: "stock", header: t("colStock"), cell: (i) => <span>{i.stock == null ? t("noLimit") : arNum(i.stock)}</span> },
    { key: "state", header: t("colState"), cell: (i) => (i.active ? <Badge tone="success">{t("stateActive")}</Badge> : <Badge tone="neutral">{t("stateInactive")}</Badge>) },
    { key: "act", header: t("colAction"), cell: (i) => (
      <div style={{ display: "flex", gap: sp(2), justifyContent: "flex-end" }}>
        <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/market/${i.id}/edit`)}>{t("actEdit")}</Button>
        <Button variant="ghost" size="sm" onClick={() => void toggle(i)}>{i.active ? t("actDeactivate") : t("actActivate")}</Button>
      </div>
    ) },
  ];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/market"
      title={t("pageTitle")} crumbs={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbAdmin") }, { label: t("crumbBaydar") }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !items && <p style={{ color: ui.color.muted }}>{t("loading")}</p>}

      {items && (
        <>
          {gifts.length > 0 && (
            <section style={{ background: "var(--color-warn-bg)", border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.lg, padding: sp(4), marginBottom: sp(6) }}>
              <h2 style={{ fontSize: ui.text.lg, fontWeight: 700, marginBottom: sp(1) }}>{t("giftsTitle")}</h2>
              <p style={{ color: ui.color.muted, marginTop: 0 }}>{t("giftsHint")}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}>
                {gifts.map((g) => (
                  <div key={g.id} style={{ display: "flex", flexWrap: "wrap", gap: sp(3), alignItems: "flex-end", justifyContent: "space-between", borderTop: `1px solid ${ui.color.border}`, paddingTop: sp(3) }}>
                    <div style={{ display: "flex", gap: sp(2), alignItems: "center" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {g.imageUrl && <img src={g.imageUrl} alt="" width={40} height={40} style={{ borderRadius: ui.radius.sm, objectFit: "cover" }} />}
                      <div>
                        <div style={{ fontWeight: 700 }}>{g.nameAr}</div>
                        <div style={{ fontSize: ui.text.xs, color: ui.color.muted }}>
                          {g.targetStudentName ? `خاصّة بـ ${g.targetStudentName}` : t("giftGeneral")} · {t("giftProposedBy")} {g.proposedByName ?? "—"}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: sp(2), alignItems: "flex-end" }}>
                      <Field label={t("giftApprovedValue")}>
                        <Input type="number" value={priceEdits[g.id] ?? String(g.proposedPricePoints ?? "")}
                          onChange={(e) => setPriceEdits((p) => ({ ...p, [g.id]: e.target.value }))} style={{ width: 96 }} />
                      </Field>
                      <Button size="sm" onClick={() => void decideGift(g.id, "approve")}>{t("giftApprove")}</Button>
                      <Button variant="ghost" size="sm" onClick={() => void decideGift(g.id, "reject")}>{t("giftReject")}</Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: sp(3), marginBottom: sp(4) }}>
            <p style={{ color: ui.color.muted, margin: 0 }}>
              {t("listHint")}
            </p>
            <Button onClick={() => router.push("/admin/market/new")}>{t("newBtn")}</Button>
          </div>

          <Table columns={cols} rows={items} empty={t("tableEmpty")} />
        </>
      )}
    </AppShell>
  );
}
