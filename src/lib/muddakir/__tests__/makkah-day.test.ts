import { describe, expect, it } from "vitest";

import { dayDiff, epochDay, makkahDayBounds, makkahDayDate } from "../makkah-day";

// §٣: يوم البرنامج من منتصف الليل إلى منتصف الليل بتوقيت مكّة (Asia/Riyadh = UTC+3 ثابتاً).

describe("makkahDayBounds — حدود اليوم عند منتصف الليل", () => {
  it("بداية اليوم = منتصف ليل مكّة = ٢١:٠٠ UTC لليوم السابق، ونهايته بعده بـ٢٤ ساعة", () => {
    const { start, end } = makkahDayBounds("2026-10-04");
    expect(start.toISOString()).toBe("2026-10-03T21:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-04T21:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("البداية شاملة والنهاية حصريّة حول منتصف الليل", () => {
    const { start, end } = makkahDayBounds("2026-10-04");
    expect(makkahDayDate(start)).toBe("2026-10-04"); // أوّل لحظةٍ في اليوم
    expect(makkahDayDate(new Date(start.getTime() - 1))).toBe("2026-10-03"); // قبلها بملّي = الأمس
    expect(makkahDayDate(new Date(end.getTime() - 1))).toBe("2026-10-04"); // آخر لحظةٍ في اليوم
    expect(makkahDayDate(end)).toBe("2026-10-05"); // منتصف ليل الغد = اليوم التالي
  });

  it("يرفض تاريخاً غير صالح", () => {
    expect(() => makkahDayBounds("2026/10/04")).toThrow();
  });
});

describe("makkahDayDate — اليوم القرآنيّ للحظة", () => {
  it("لحظةٌ قبل منتصف الليل بمكّة تبقى في يومها، وبعده تنتقل للغد", () => {
    expect(makkahDayDate(new Date("2026-10-04T20:59:59Z"))).toBe("2026-10-04"); // ٢٣:٥٩:٥٩ بمكّة
    expect(makkahDayDate(new Date("2026-10-04T21:00:00Z"))).toBe("2026-10-05"); // ٠٠:٠٠:٠٠ بمكّة
  });
});

describe("dayDiff / epochDay", () => {
  it("dayDiff فرقٌ بالأيّام موجبٌ للأحدث", () => {
    expect(dayDiff("2026-10-04", "2026-10-01")).toBe(3);
    expect(dayDiff("2026-10-01", "2026-10-04")).toBe(-3);
    expect(dayDiff("2026-10-04", "2026-10-04")).toBe(0);
  });

  it("epochDay متتالٍ لأيّامٍ متتالية", () => {
    expect(epochDay("2026-10-05") - epochDay("2026-10-04")).toBe(1);
  });
});
