"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

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

const box: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "1.5rem",
  fontFamily: "system-ui, sans-serif",
};
const input: React.CSSProperties = { padding: "0.4rem", fontSize: "1rem", fontFamily: "inherit" };
const btn: React.CSSProperties = { padding: "0.3rem 0.7rem", cursor: "pointer", marginInlineStart: 8 };

async function token(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export default function AdminListsPage() {
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

  if (err) return <main style={box}>{err}</main>;
  if (!lists) return <main style={box}>جارٍ التحميل…</main>;

  const sections: { kind: Kind; title: string; items: Item[] }[] = [
    { kind: "nationality", title: "الجنسيات", items: lists.nationalities },
    { kind: "schoolStage", title: "المراحل الدراسية", items: lists.schoolStages },
    { kind: "guardianRelation", title: "صفات القرابة", items: lists.guardianRelations },
  ];

  return (
    <main style={box}>
      <h1>إدارة القوائم</h1>
      <p style={{ opacity: 0.75 }}>
        إضافةٌ وتعطيل (لا حذف — القيمة قد ترتبط بطلباتٍ سابقة). المعطَّل لا يظهر في نموذج القيد.
      </p>
      <input
        style={{ ...input, width: "100%", marginBottom: 16 }}
        placeholder="تصفية بالاسم…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {sections.map((sec) => {
        const shown = filter.trim()
          ? sec.items.filter((i) => i.nameAr.includes(filter.trim()))
          : sec.items;
        return (
          <section key={sec.kind} style={{ marginBottom: 28 }}>
            <h2>
              {sec.title} ({sec.items.length})
            </h2>
            <div style={{ display: "flex", marginBottom: 10 }}>
              <input
                style={{ ...input, flex: 1 }}
                placeholder="قيمة جديدة…"
                value={drafts[sec.kind]}
                onChange={(e) => setDrafts((d) => ({ ...d, [sec.kind]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void add(sec.kind);
                }}
              />
              <button style={btn} onClick={() => void add(sec.kind)}>
                إضافة
              </button>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {shown.map((i) => (
                <li
                  key={i.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.35rem 0",
                    borderBottom: "1px solid #f0f0f0",
                    opacity: i.isActive ? 1 : 0.5,
                  }}
                >
                  <span>
                    {i.nameAr}
                    {!i.isActive && <span style={{ marginInlineStart: 8, fontSize: "0.8rem" }}>(معطَّل)</span>}
                  </span>
                  <button style={btn} onClick={() => void toggle(sec.kind, i)}>
                    {i.isActive ? "تعطيل" : "تفعيل"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
