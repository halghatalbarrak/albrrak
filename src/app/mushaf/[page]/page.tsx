"use client";
/* eslint-disable @next/next/no-img-element -- صورة وجهٍ من CDN (WebP)؛ لا تحتاج next/image. */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Button, Skeleton, ui, sp } from "@/components/ui";

interface FaceView { page: number; fromSurah: number; fromAyah: number; toSurah: number; toAyah: number; imageUrl: string }

export default function MushafPage() {
  const { me } = useMe();
  const params = useParams<{ page: string }>();
  const page = Number(params.page);
  const [face, setFace] = useState<FaceView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFace(null); setErr(null);
    const { data: { session } } = await supabaseBrowser().auth.getSession();
    if (!session) { window.location.href = "/login"; return; }
    const res = await fetch(`/api/mushaf/faces/${page}`, { headers: { authorization: `Bearer ${session.access_token}` } });
    if (!res.ok) { setErr("تعذّر تحميل الوجه."); return; }
    setFace((await res.json()) as FaceView);
  }, [page]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/mushaf"
      title={`المصحف — وجه ص${page}`} crumbs={[{ label: "الرئيسة", href: "/" }, { label: "المصحف" }, { label: `ص${page}` }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !face && <Skeleton height={420} width="min(92vw, 400px)" />}

      {face && (
        <>
          <Card style={{ marginBottom: sp(4), display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(3), flexWrap: "wrap" }}>
            <span>من {face.fromSurah}:{face.fromAyah} إلى {face.toSurah}:{face.toAyah}</span>
            <div style={{ display: "flex", gap: sp(2) }}>
              <Link href={`/mushaf/${Math.max(1, page - 1)}`}><Button variant="ghost" size="sm">الوجه السابق</Button></Link>
              <Link href={`/mushaf/${Math.min(604, page + 1)}`}><Button variant="ghost" size="sm">الوجه التالي</Button></Link>
            </div>
          </Card>
          <div style={{ width: "min(92vw, 400px)", border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.md, overflow: "hidden", background: ui.color.surface }}>
            <img src={face.imageUrl} alt={`وجه ص${page}`} style={{ width: "100%", display: "block" }} />
          </div>
        </>
      )}
    </AppShell>
  );
}
