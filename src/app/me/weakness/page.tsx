"use client";

import { useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, EmptyState, Skeleton, FaceHeatmap, ui, sp } from "@/components/ui";

interface WAyah { surah: number; ayah: number; count: number; level: number }
interface WFace { pageNo: number; imageUrl: string; polygonsUrl: string; viewBox: { width: number; height: number }; ayahs: WAyah[] }
interface WMap { studentName: string; faces: WFace[]; totalErrors: number; weakestAyahs: WAyah[] }

export default function MyWeaknessPage() {
  const { me } = useMe();
  const [map, setMap] = useState<WMap | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabaseBrowser().auth.getSession();
      if (!session) { window.location.href = "/login"; return; }
      const res = await fetch("/api/me/weakness-map", { headers: { authorization: `Bearer ${session.access_token}` } });
      if (!res.ok) { setErr("تعذّر جلب صفحتك."); return; }
      setMap((await res.json()) as WMap);
    })();
  }, []);

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/me"
      title="مواضع تحتاج مراجعة" crumbs={[{ label: "الرئيسة", href: "/" }, { label: "التعلّم" }, { label: "صفحتي", href: "/me" }, { label: "مواضع تحتاج مراجعة" }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !map && <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}><Skeleton height={40} /><Skeleton height={200} /></div>}

      {map && map.faces.length === 0 && (
        <EmptyState title="لا مواضع بعد — أحسنتَ" description="حين يُرصد لك موضعٌ يحتاج مراجعة، يظهر هنا مظلَّلاً لتوليه عناية." />
      )}

      {map && map.faces.length > 0 && (
        <>
          <Card style={{ marginBottom: sp(5), borderInlineStart: `4px solid ${ui.color.bronze}` }}>
            هذه مواضعُ تحتاج شيئًا من مراجعتك — كلّما اشتدّ لونها فأولِها مزيدَ عناية. اجعلها ورد يومك القادم بإذن الله.
          </Card>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: sp(4) }}>
            {map.faces.map((f) => (
              <FaceHeatmap key={f.pageNo} imageUrl={f.imageUrl} polygonsUrl={f.polygonsUrl} viewBox={f.viewBox} ayahs={f.ayahs} />
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
