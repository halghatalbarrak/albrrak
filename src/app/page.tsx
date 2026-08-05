"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { supabaseBrowser } from "@/lib/supabase-browser";

// الصفحة الرئيسة: روابط عامة (تقديم/دخول)، ولوحةٌ حسب دور الداخل. كل رابط يصل لشاشةٍ مبنيّة.

interface Me {
  name: string;
  roles: string[];
}

const box: React.CSSProperties = {
  display: "flex",
  minHeight: "100dvh",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "1rem",
  padding: "2rem",
  textAlign: "center",
  fontFamily: "system-ui, sans-serif",
};
const grid: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  justifyContent: "center",
  maxWidth: 640,
};
const tile: React.CSSProperties = {
  padding: "0.6rem 1rem",
  border: "1px solid #1F5C3D",
  borderRadius: 8,
  color: "#14281D",
  textDecoration: "none",
  background: "#FBFAF5",
};
export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabaseBrowser().auth.getSession();
        if (session) {
          const res = await fetch("/api/me", {
            headers: { authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) setMe((await res.json()) as Me);
        }
      } catch {
        /* اللوحة إضافةٌ لا تُعطّل الصفحة إن فشلت */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const roles = me?.roles ?? [];
  const isManager = roles.includes("SUPER_ADMIN") || roles.includes("CIRCLE_MANAGER");
  const canRecordAttendance = isManager || roles.includes("TEACHER");
  const canRecite = isManager || roles.includes("RECITER");

  return (
    <main dir="rtl" style={box}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>منصة حلقات البراك</h1>

      {!me && (
        <div style={grid}>
          <Link href="/apply" style={tile}>تقديم طلب</Link>
          <Link href="/login" style={tile}>دخول</Link>
        </div>
      )}

      {me && (
        <>
          <p style={{ opacity: 0.6, margin: 0 }}>مرحبًا {me.name}</p>
          <div style={grid}>
            <Link href="/me" style={tile}>صفحتي</Link>
            <Link href="/programs/civil-base" style={tile}>السلّم البياني</Link>
            <Link href="/programs/maraqi" style={tile}>مراقي</Link>
            {isManager && (
              <>
                <Link href="/admin/applications" style={tile}>الطلبات</Link>
                <Link href="/admin/students" style={tile}>الطلاب</Link>
                <Link href="/admin/circles" style={tile}>الحلقات</Link>
                <Link href="/admin/enrollment" style={tile}>الإسناد</Link>
                <Link href="/admin/lists" style={tile}>القوائم</Link>
              </>
            )}
            {canRecordAttendance && (
              <>
                <Link href="/admin/attendance" style={tile}>الحضور</Link>
                <Link href="/admin/session" style={tile}>الجلسة اليومية</Link>
              </>
            )}
            {canRecite && (
              <Link href="/admin/hasad" style={tile}>الحصاد</Link>
            )}
          </div>
        </>
      )}

      {ready && !me && (
        <p style={{ opacity: 0.4, margin: 0, fontSize: "0.85rem" }}>سجّل الدخول لعرض لوحتك.</p>
      )}
    </main>
  );
}
