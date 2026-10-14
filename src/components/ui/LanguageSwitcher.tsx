"use client";

import { supabaseBrowser } from "@/lib/supabase-browser";
import { LOCALES, LOCALE_COOKIE, LOCALE_LABEL, coerceLocale, type Locale } from "@/lib/locale";
import { ui, sp } from "./tokens";

// زرّ اللغة (التوطين، PR-1): يحفظ الاختيار في cookie (لمن لم يسجّل) وفي حساب المستخدم إن كان
// مسجَّلاً (PATCH /api/me/locale)، ثمّ يُعيد التحميل ليسري الاتّجاه واللغة (يُضبطان خادميّاً).
function readCookieLocale(): Locale {
  if (typeof document === "undefined") return "ar";
  const m = document.cookie.match(new RegExp("(?:^|; )" + LOCALE_COOKIE + "=([^;]*)"));
  return coerceLocale(m ? decodeURIComponent(m[1]) : undefined);
}

export function LanguageSwitcher() {
  const current = readCookieLocale();

  async function choose(locale: Locale) {
    if (locale === current) return;
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    try {
      const { data: { session } } = await supabaseBrowser().auth.getSession();
      if (session) {
        await fetch("/api/me/locale", {
          method: "PATCH",
          headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ locale }),
        });
      }
    } catch {
      /* الحفظ في الحساب إضافة؛ الـcookie كافٍ لسريان اللغة */
    }
    window.location.reload();
  }

  return (
    <div role="group" aria-label="اللغة / Language / Язык" style={{ display: "flex", gap: 2, alignItems: "center" }}>
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => void choose(l)}
          aria-pressed={l === current}
          title={LOCALE_LABEL[l]}
          style={{
            border: `1px solid ${l === current ? ui.color.goldLine : ui.color.border}`,
            background: l === current ? ui.color.soft : ui.color.surface,
            color: l === current ? ui.color.text : ui.color.muted,
            borderRadius: ui.radius.sm, padding: `${sp(0.5)} ${sp(1.5)}`, cursor: "pointer",
            fontFamily: ui.font, fontSize: ui.text.xs, fontWeight: l === current ? 700 : 400,
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
