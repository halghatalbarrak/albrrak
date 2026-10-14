import { describe, expect, it } from "vitest";

import { LOCALES, DEFAULT_LOCALE, isLocale, coerceLocale, resolveLocale, dirFor } from "../locale";
import { arNum, fmtNum, fmtDate, hijri } from "../format";

describe("أساس التوطين (PR-1) — بلا تغيّرٍ ظاهرٍ للعربية", () => {
  it("العربية هي الافتراضيّة واتجاهها RTL، وغيرها LTR", () => {
    expect(DEFAULT_LOCALE).toBe("ar");
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
    expect(dirFor("ru")).toBe("ltr");
    expect(LOCALES).toEqual(["ar", "en", "ru"]);
  });

  it("isLocale/coerceLocale يقبلان الصالح ويردّان الافتراضيّة للباقي", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(coerceLocale("ru")).toBe("ru");
    expect(coerceLocale(undefined)).toBe("ar");
    expect(coerceLocale("xx")).toBe("ar");
  });

  it("resolveLocale يختار أوّل مصدرٍ صالح بالأولويّة، وإلا الافتراضيّة", () => {
    expect(resolveLocale("en", "ru")).toBe("en"); // الأعلى أولويّةً أوّلاً
    expect(resolveLocale(undefined, "ru")).toBe("ru"); // يتخطّى غير الصالح
    expect(resolveLocale(null, "xx")).toBe("ar"); // لا صالح ⟵ الافتراضيّة
    expect(resolveLocale()).toBe("ar");
  });

  it("fmtNum للعربية = arNum حرفيّاً (لا تغيير)، وللإنجليزية/الروسية أرقامٌ غربية", () => {
    for (const n of [0, 5, 10, 2026, 604]) {
      expect(fmtNum(n, "ar")).toBe(arNum(n)); // مطابقةٌ بايتيّة للعربية
      expect(fmtNum(n, "en")).toBe(String(n));
      expect(fmtNum(n, "ru")).toBe(String(n));
    }
  });

  it("fmtDate للعربية = hijri حرفيّاً (لا تغيير)، وللإنجليزية/الروسية ميلاديّ", () => {
    const iso = "2026-10-13";
    expect(fmtDate(iso, "ar")).toBe(hijri(iso)); // مطابقةٌ للعربية
    expect(fmtDate(iso, "en")).toMatch(/2026/); // ميلاديّ بالإنجليزية
    expect(fmtDate(iso, "ru")).toMatch(/2026/); // ميلاديّ بالروسية
  });
});
