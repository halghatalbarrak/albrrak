"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Badge, EmptyState, Skeleton, FaceHeatmap, ui, sp } from "@/components/ui";

interface WAyah { surah: number; ayah: number; count: number; level: number }
interface WFace { pageNo: number; imageUrl: string; polygonsUrl: string; viewBox: { width: number; height: number }; ayahs: WAyah[] }
interface CMap { circleName: string; studentCount: number; faces: WFace[]; weakestAyahs: WAyah[] }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

function Dot({ level }: { level: number }) {
  const op = level >= 3 ? 0.72 : level === 2 ? 0.5 : 0.28;
  return <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 999, background: ui.color.bronze, opacity: op, marginInlineEnd: sp(2) }} />;
}

export default function CircleWeaknessPage() {
  const { me } = useMe();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [map, setMap] = useState<CMap | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = await token();
    if (!t) { window.location.href = "/login"; return; }
    const res = await fetch(`/api/circles/${id}/weakness-map`, { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) { setErr("لا صلاحية — لا تَرى إلا خريطة حلقتك."); return; }
    if (!res.ok) { setErr("تعذّر جلب الخريطة."); return; }
    setMap((await res.json()) as CMap);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const nStudents = (n: number) => `${n} ${n === 1 ? "طالب" : n === 2 ? "طالبان" : "طلاب"}`;

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/circles"
      title={`خريطة ضعف الحلقة${map ? ` — ${map.circleName}` : ""}`}
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "الحلقات", href: "/admin/circles" }, { label: "الخريطة" }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !map && <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}><Skeleton height={40} /><Skeleton height={200} /></div>}

      {map && map.faces.length === 0 && (
        <EmptyState title="لا مواضع تعثّرٍ جماعيّ بعد" description="تظهر الخريطة حين يتعثّر طلابٌ في آياتٍ بعينها خلال الحصاد." />
      )}

      {map && map.faces.length > 0 && (
        <>
          <Card style={{ marginBottom: sp(5), borderInlineStart: `4px solid ${ui.color.bronze}` }}>
            آيةٌ يتعثّر فيها عدّةٌ من طلابك = خللٌ في التلقين لا في الطلاب — علّمها الحلقةَ جماعةً.
            كلّما اشتدّ البرونزيّ كثُر المتعثّرون فيها.
          </Card>

          <h2 style={{ fontSize: ui.text.lg, fontWeight: 700 }}>أكثر المواضع تعثّرًا</h2>
          <Card style={{ marginBottom: sp(6), padding: `${sp(2)} ${sp(4)}` }}>
            {map.weakestAyahs.slice(0, 12).map((a) => (
              <div key={`${a.surah}:${a.ayah}`} style={{ display: "flex", alignItems: "center", padding: `${sp(2)} 0`, borderBottom: `1px solid ${ui.color.border}` }}>
                <Dot level={a.level} />
                <span style={{ flex: 1 }}>سورة {a.surah} · آية {a.ayah}</span>
                <Badge tone="bronze">تعثّر فيها {nStudents(a.count)}</Badge>
              </div>
            ))}
          </Card>

          <h2 style={{ fontSize: ui.text.lg, fontWeight: 700 }}>الأوجه</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: sp(4) }}>
            {map.faces.map((f) => (
              <div key={f.pageNo} style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
                <div style={{ fontSize: ui.text.xs, color: ui.color.muted }}>وجه ص{f.pageNo} · {f.ayahs.length} موضعًا</div>
                <FaceHeatmap imageUrl={f.imageUrl} polygonsUrl={f.polygonsUrl} viewBox={f.viewBox} ayahs={f.ayahs} />
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
