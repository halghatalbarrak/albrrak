// ═══════════════ التوطين — الأساس (PR-1، بلا تغيّرٍ ظاهرٍ للعربية) ═══════════════
// العربية افتراضية. en وru: LTR وأرقام غربية. ar: RTL وأرقام مشرقية. المرجع: docs/I18N_GLOSSARY.md.

export const LOCALES = ["ar", "en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ar";
export const LOCALE_COOKIE = "albrrak.locale";

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** اتجاه الكتابة: العربية RTL، وغيرها LTR. */
export function dirFor(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** اسم اللغة بلسانها (لزرّ التبديل). */
export const LOCALE_LABEL: Record<Locale, string> = { ar: "العربية", en: "English", ru: "Русский" };

/** يحلّل قيمةً واحدةً إلى لغةٍ صالحة أو الافتراضيّة. */
export function coerceLocale(v: unknown): Locale {
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/**
 * يحلّل اللغة الفعّالة من عدّة مصادرَ بالأولويّة (أوّل صالحٍ يفوز، وإلّا الافتراضيّة).
 * يُمرَّر المصدر الأعلى أولويّةً أوّلاً (مثلاً لغة الحساب ثمّ cookie). يسمح بسهولة إضافة
 * مصادر لاحقاً (مزامنة لغة الحساب) بلا تغيير المستدعي.
 */
export function resolveLocale(...candidates: unknown[]): Locale {
  for (const c of candidates) if (isLocale(c)) return c;
  return DEFAULT_LOCALE;
}
