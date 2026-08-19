"use client";
/* eslint-disable @next/next/no-img-element -- شعارٌ من public/ بأبعادٍ ثابتة. */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { ui, sp } from "@/components/ui";
import { hijri } from "@/lib/format";

interface Cert { valid: boolean; revoked: boolean; unknown?: boolean; recipientName?: string; type?: string; issuedAt?: string; excellent?: boolean; issuer?: string }

// صفحةٌ عامّةٌ للتحقّق من الشهادة (الفكرة ١٠) — قائمةٌ بذاتها بهوية المنصّة، بلا شريطٍ جانبيّ.
export default function VerifyPage() {
  const { token } = useParams<{ token: string }>();
  const [cert, setCert] = useState<Cert | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try { const r = await fetch(`/api/verify/${token}`); if (r.ok) setCert(await r.json()); } catch { /* تجاهل */ } finally { setLoading(false); }
    })();
  }, [token]);

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: sp(4), padding: `${sp(2)} 0`, borderBottom: `1px solid ${ui.color.border}` }}>
      <span style={{ color: ui.color.muted, fontSize: ui.text.xs, fontWeight: 600 }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );

  const ok = cert && cert.valid;
  const revoked = cert && cert.revoked;

  return (
    <main dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: sp(6) }}>
      <div style={{ display: "flex", alignItems: "center", gap: sp(2), marginBottom: sp(5) }}>
        <img src="/png/logo.jpeg" alt="" style={{ height: 56, borderRadius: ui.radius.md }} />
        <span style={{ fontWeight: 700, fontSize: ui.text.lg, color: ui.color.primary }}>حلقات الشيخ محمد البراك</span>
      </div>

      <div style={{ background: ui.color.surface, border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.lg, boxShadow: ui.shadowCard, padding: sp(6), width: "100%", maxWidth: 480 }}>
        {loading && <p style={{ color: ui.color.muted, margin: 0, textAlign: "center" }}>…جارٍ التحقّق</p>}

        {!loading && (!cert || cert.unknown) && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40 }}>✕</div>
            <p style={{ fontWeight: 700, fontSize: ui.text.lg, color: ui.color.danger, margin: `${sp(2)} 0 0` }}>شهادةٌ غير معروفة</p>
            <p style={{ color: ui.color.muted, margin: `${sp(1)} 0 0` }}>لا نجد شهادةً بهذا الرمز.</p>
          </div>
        )}

        {!loading && revoked && (
          <div style={{ textAlign: "center", marginBottom: sp(4) }}>
            <div style={{ fontSize: 40, color: ui.color.danger }}>⊘</div>
            <p style={{ fontWeight: 700, fontSize: ui.text.lg, color: ui.color.danger, margin: `${sp(2)} 0 0` }}>هذه الشهادة مُبطَلة</p>
          </div>
        )}

        {!loading && ok && (
          <div style={{ textAlign: "center", marginBottom: sp(4) }}>
            <div style={{ fontSize: 40, color: ui.color.success }}>✓</div>
            <p style={{ fontWeight: 700, fontSize: ui.text.lg, color: ui.color.success, margin: `${sp(2)} 0 0` }}>شهادةٌ صحيحة</p>
          </div>
        )}

        {!loading && cert && !cert.unknown && (
          <div>
            {row("الاسم", cert.recipientName)}
            {row("الشهادة", cert.type)}
            {row("تاريخ الإصدار", cert.issuedAt ? hijri(cert.issuedAt) : "—")}
            {cert.excellent && row("المرتبة", <span style={{ color: ui.color.bronzeHover }}>تميّز</span>)}
            {row("الجهة المُصدِرة", cert.issuer)}
          </div>
        )}
      </div>
    </main>
  );
}
