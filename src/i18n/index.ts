// ═══════════════ سجلّ القواميس — الأساس (PR-1a) ═══════════════
// يجمع قواميس اللغات الثلاث بنطاقاتها. العربية هي المرجِع (fallback): كلّ مفتاحٍ لا تملكه
// en/ru يرتدّ إلى نصّ العربية، فلا تنكسر الواجهة أثناء ملء الترجمات تدريجيّاً (PR-2/PR-3).
// index.ts مستقلٌّ عن React (يصلح للخادم)؛ الخطّاف useT في «./useT».

import { type Locale } from "@/lib/locale";
import * as ar from "./ar";
import * as en from "./en";
import * as ru from "./ru";

const REGISTRY = { ar, en, ru } as const;

/** نطاقات القواميس المتاحة (muddakir · gamification · attendanceLock · display · maraqi). */
export type Domain = keyof typeof ar;

/**
 * نصّ مفتاحٍ في نطاقٍ باللغة المطلوبة، مع ارتدادٍ إلى العربية ثمّ إلى المفتاح نفسه.
 * العربية مطابقةٌ بايتيّاً للقاموس العربيّ (لا تغيّر ظاهر للعربية في PR-1).
 */
export function t(locale: Locale, domain: Domain, key: string): string {
  const dict = REGISTRY[locale][domain] as Record<string, string>;
  const fallback = REGISTRY.ar[domain] as Record<string, string>;
  return dict[key] ?? fallback[key] ?? key;
}
