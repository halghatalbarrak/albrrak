"use client";

import { useMemo } from "react";
import { coerceLocale, type Locale } from "@/lib/locale";
import { t, type Domain } from "./index";

/** اللغة المعروضة حاليّاً — من `<html lang>` الذي يضبطه layout خادميّاً (بلا وميض). */
export function clientLocale(): Locale {
  if (typeof document === "undefined") return "ar";
  return coerceLocale(document.documentElement.lang);
}

/**
 * خطّاف نصوصٍ لنطاقٍ باللغة المعروضة، مع ارتدادٍ إلى العربية (التوطين، PR-1a).
 * الاستعمال: `const t = useT("muddakir"); t("programName")`.
 */
export function useT(domain: Domain): (key: string) => string {
  const locale = clientLocale();
  return useMemo(() => (key: string) => t(locale, domain, key), [locale, domain]);
}
