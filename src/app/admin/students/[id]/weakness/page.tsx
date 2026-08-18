"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Badge, EmptyState, Skeleton, FaceHeatmap, ui, sp } from "@/components/ui";

interface WAyah { surah: number; ayah: number; count: number; level: number }
interface WFace { pageNo: number; imageUrl: string; polygonsUrl: string; viewBox: { width: number; height: number }; ayahs: WAyah[] }
interface WMap { studentName: string; faces: WFace[]; totalErrors: number; weakestAyahs: WAyah[] }

async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

// نقطةٌ برونزيّةٌ تعكس الشدّة (١/٢/٣).
function Dot({ level }: { level: number }) {
  const op = level >= 3 ? 0.72 : level === 2 ? 0.5 : 0.28;
  return <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 999, background: ui.color.bronze, opacity: op, marginInlineEnd: sp(2) }} />;
}

export default function StudentWeaknessPage() {
  const { me } = useMe();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [map, setMap] = useState<WMap | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = await token();
    if (!t) { window.location.href = "/login"; return; }
    const res = await fetch(`/api/students/${id}/weakness-map`, { headers: { authorization: `Bearer ${t}` } });
    if (res.status === 403) { setErr("لا صلاحية — لا تَرى إلا خرائط طلابك."); return; }
    if (!res.ok) { setErr("تعذّر جلب الخريطة."); return; }
    setMap((await res.json()) as WMap);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/students"
      title={`خريطة الضعف${map ? ` — ${map.studentName}` : ""}`}
      crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "الطلاب", href: "/admin/students" }, { label: "الخريطة" }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !map && <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}><Skeleton height={40} /><Skeleton height={200} /></div>}

      {map && map.faces.length === 0 && (
        <EmptyState title="لا مواضع خطأٍ مسجّلة بعد" description="تظهر الخريطة بعد حصادٍ تُرصد فيه أخطاءٌ عند الآيات." />
      )}

      {map && map.faces.length > 0 && (
        <>
          <Card style={{ marginBottom: sp(5), display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(3), flexWrap: "wrap" }}>
            <span>مجموع الأخطاء المسجَّلة: <strong>{map.totalErrors}</strong> على <strong>{map.faces.length}</strong> وجهًا.</span>
            <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>كلّما اشتدّ البرونزيّ كثُر الخطأ.</span>
          </Card>

          {/* أكثر الآيات خطأً (للمعلّم) */}
          <h2 style={{ fontSize: ui.text.lg, fontWeight: 700 }}>أكثر المواضع خطأً</h2>
          <Card style={{ marginBottom: sp(6), padding: `${sp(2)} ${sp(4)}` }}>
            {map.weakestAyahs.slice(0, 12).map((a) => (
              <div key={`${a.surah}:${a.ayah}`} style={{ display: "flex", alignItems: "center", padding: `${sp(2)} 0`, borderBottom: `1px solid ${ui.color.border}` }}>
                <Dot level={a.level} />
                <span style={{ flex: 1 }}>سورة {a.surah} · آية {a.ayah}</span>
                <Badge tone="bronze">{a.count} {a.count === 1 ? "مرّة" : "مرّات"}</Badge>
              </div>
            ))}
          </Card>

          {/* الأوجه مظلَّلة */}
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
