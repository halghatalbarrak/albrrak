"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { useMe } from "@/lib/useMe";
import { AppShell, Card, Badge, EmptyState, Skeleton, FaceHeatmap, ui, sp } from "@/components/ui";
import { tStudents as t } from "@/i18n/ar/students";

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
    const tok = await token();
    if (!tok) { window.location.href = "/login"; return; }
    const res = await fetch(`/api/students/${id}/weakness-map`, { headers: { authorization: `Bearer ${tok}` } });
    if (res.status === 403) { setErr(t("weaknessNoPermission")); return; }
    if (!res.ok) { setErr(t("fetchMapFailed")); return; }
    setMap((await res.json()) as WMap);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell roles={me?.roles ?? []} userName={me?.name} activeHref="/admin/students"
      title={`${t("weaknessMapTitlePrefix")}${map ? ` — ${map.studentName}` : ""}`}
      crumbs={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbAdmin") }, { label: t("crumbStudents"), href: "/admin/students" }, { label: t("crumbWeaknessMap") }]}>

      {err && <p style={{ color: ui.color.danger }}>{err}</p>}
      {!err && !map && <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}><Skeleton height={40} /><Skeleton height={200} /></div>}

      {map && map.faces.length === 0 && (
        <EmptyState title={t("noErrorsYet")} description={t("noErrorsYetDesc")} />
      )}

      {map && map.faces.length > 0 && (
        <>
          <Card style={{ marginBottom: sp(5), display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(3), flexWrap: "wrap" }}>
            <span>{t("totalErrorsPrefix")}<strong>{map.totalErrors}</strong>{t("totalErrorsMid")}<strong>{map.faces.length}</strong>{t("totalErrorsSuffix")}</span>
            <span style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{t("heatHint")}</span>
          </Card>

          {/* أكثر الآيات خطأً (للمعلّم) */}
          <h2 style={{ fontSize: ui.text.lg, fontWeight: 700 }}>{t("mostErrorsTitle")}</h2>
          <Card style={{ marginBottom: sp(6), padding: `${sp(2)} ${sp(4)}` }}>
            {map.weakestAyahs.slice(0, 12).map((a) => (
              <div key={`${a.surah}:${a.ayah}`} style={{ display: "flex", alignItems: "center", padding: `${sp(2)} 0`, borderBottom: `1px solid ${ui.color.border}` }}>
                <Dot level={a.level} />
                <span style={{ flex: 1 }}>{t("surahWord")} {a.surah} · {t("ayahWord")} {a.ayah}</span>
                <Badge tone="bronze">{a.count} {a.count === 1 ? t("onceWord") : t("manyTimesWord")}</Badge>
              </div>
            ))}
          </Card>

          {/* الأوجه مظلَّلة */}
          <h2 style={{ fontSize: ui.text.lg, fontWeight: 700 }}>{t("facesTitle")}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: sp(4) }}>
            {map.faces.map((f) => (
              <div key={f.pageNo} style={{ display: "flex", flexDirection: "column", gap: sp(2) }}>
                <div style={{ fontSize: ui.text.xs, color: ui.color.muted }}>{t("facePagePrefix")}{f.pageNo} · {f.ayahs.length} {t("positionsSuffix")}</div>
                <FaceHeatmap imageUrl={f.imageUrl} polygonsUrl={f.polygonsUrl} viewBox={f.viewBox} ayahs={f.ayahs} />
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
