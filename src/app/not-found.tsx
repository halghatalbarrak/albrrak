import Link from "next/link";
import { ui, sp } from "@/components/ui";

const T = {
  code: "٤٠٤",
  title: "الصفحة غير موجودة",
  body: "تعذّر العثور على هذه الصفحة.",
  home: "العودة إلى الرئيسة",
} as const;

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: sp(4),
        fontFamily: ui.font,
        background: ui.color.bg,
        color: ui.color.text,
        padding: sp(8),
        textAlign: "center",
        direction: "rtl",
      }}
    >
      <span style={{ fontSize: "4rem", lineHeight: 1 }}>{T.code}</span>
      <h1 style={{ fontSize: ui.text.xl, fontWeight: 700, margin: 0 }}>{T.title}</h1>
      <p style={{ fontSize: ui.text.xs, color: ui.color.muted, margin: 0 }}>{T.body}</p>
      <Link
        href="/"
        style={{
          marginTop: sp(2),
          fontSize: ui.text.xs,
          color: ui.color.primary,
          textDecoration: "none",
          padding: `${sp(2)} ${sp(4)}`,
          border: `1px solid ${ui.color.primary}`,
          borderRadius: ui.radius.md,
        }}
      >
        {T.home}
      </Link>
    </div>
  );
}
