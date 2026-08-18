"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Button, Input, ui, sp } from "@/components/ui";

interface Item {
  id: string;
  nameAr: string;
  ordinal: number;
  isActive: boolean;
}
interface Lists {
  nationalities: Item[];
  schoolStages: Item[];
  guardianRelations: Item[];
}
type Kind = "nationality" | "schoolStage" | "guardianRelation";

async function token(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function AdminListsPage() {
  const { me } = useMe();
  const [lists, setLists] = useState<Lists | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [drafts, setDrafts] = useState<Record<Kind, string>>({
    nationality: "",
    schoolStage: "",
    guardianRelation: "",
  });

  const load = useCallback(async () => {
    const t = await token();
    if (!t) {
      window.location.href = "/login";
      return;
    }
    const res = await fetch("/api/admin/lists", { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) {
      setErr("لا صلاحية — هذه الشاشة للمدير.");
      return;
    }
    if (!res.ok) {
      setErr("تعذّر جلب القوائم.");
      return;
    }
    const data = (await res.json().catch(() => null)) as Lists | null;
    setLists(
      data && Array.isArray(data.nationalities)
        ? data
        : { nationalities: [], schoolStages: [], guardianRelations: [] },
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(kind: Kind) {
    const nameAr = drafts[kind].trim();
    if (!nameAr) return;
    const t = await token();
    if (!t) return;
    const res = await fetch("/api/admin/lists", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ kind, nameAr }),
    });
    if (res.ok) {
      setDrafts((d) => ({ ...d, [kind]: "" }));
      setErr(null);
      void load();
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ?? "تعذّرت الإضافة.");
    }
  }

  async function toggle(kind: Kind, item: Item) {
    const t = await token();
    if (!t) return;
    const res = await fetch("/api/admin/lists", {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ kind, id: item.id, isActive: !item.isActive }),
    });
    if (res.ok) void load();
    else setErr("تعذّر تغيير الحالة.");
  }

  const sections: { kind: Kind; title: string; items: Item[] }[] = lists ? [
    { kind: "nationality", title: "الجنسيات", items: lists.nationalities },
    { kind: "schoolStage", title: "المراحل الدراسية", items: lists.schoolStages },
    { kind: "guardianRelation", title: "صفات القرابة", items: lists.guardianRelations },
  ] : [];

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/lists"
      title="إدارة القوائم" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "القوائم" }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !lists && <p style={{ color: ui.color.muted }}>جارٍ التحميل…</p>}

      {lists && (
        <>
          <p style={{ color: ui.color.muted }}>
            إضافةٌ وتعطيل (لا حذف — القيمة قد ترتبط بطلباتٍ سابقة). المعطَّل لا يظهر في نموذج القيد.
          </p>
          <Input
            style={{ width: "100%", marginBottom: sp(4) }}
            placeholder="تصفية بالاسم…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />

          {sections.map((sec) => {
            const shown = filter.trim()
              ? sec.items.filter((i) => i.nameAr.includes(filter.trim()))
              : sec.items;
            return (
              <section key={sec.kind} style={{ marginBottom: sp(7) }}>
                <h2 style={{ fontSize: ui.text.lg, fontWeight: 700 }}>
                  {sec.title} ({sec.items.length})
                </h2>
                <div style={{ display: "flex", gap: sp(2), marginBottom: sp(3) }}>
                  <Input
                    style={{ flex: 1 }}
                    placeholder="قيمة جديدة…"
                    value={drafts[sec.kind]}
                    onChange={(e) => setDrafts((d) => ({ ...d, [sec.kind]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void add(sec.kind);
                    }}
                  />
                  <Button size="sm" onClick={() => void add(sec.kind)}>إضافة</Button>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {shown.map((i) => (
                    <li
                      key={i.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: `${sp(2)} 0`,
                        borderBottom: `1px solid ${ui.color.border}`,
                        opacity: i.isActive ? 1 : 0.5,
                      }}
                    >
                      <span>
                        {i.nameAr}
                        {!i.isActive && <span style={{ marginInlineStart: sp(2), fontSize: ui.text.xs }}>(معطَّل)</span>}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => void toggle(sec.kind, i)}>
                        {i.isActive ? "تعطيل" : "تفعيل"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </AppShell>
  );
}
