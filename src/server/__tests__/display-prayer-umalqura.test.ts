import { describe, expect, it } from "vitest";

import { hhmmMakkah } from "@/lib/display-schedule";
import { isRamadan, madinahPrayerMs, madinahPrayerTimes } from "../display/prayer-times";

// مواقيت المدينة المنوّرة بطريقة أمّ القرى (DISPLAY_SCREEN_RULES §١٠) — مقارنةٌ بقيمٍ مرجعيّة
// مستقلّة (Aladhan method=4 = أمّ القرى، إحداثيّات المسجد النبويّ) بفارقٍ ≤ دقيقتين.
// اليوم ثابت: 2026-05-10 (هجريّ 23-11-1447 — خارج رمضان).

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

describe("مطابقة أمّ القرى المرجعيّة (≤ دقيقتين)", () => {
  const D = "2026-05-10";
  const computed = madinahPrayerTimes(D);
  // القيم المرجعيّة لأمّ القرى (Aladhan method=4) للمدينة المنوّرة في 2026-05-10.
  const REF: Record<string, string> = { FAJR: "04:15", DHUHR: "12:18", ASR: "15:43", MAGHRIB: "18:55", ISHA: "20:25" };

  for (const p of ["FAJR", "DHUHR", "ASR", "MAGHRIB", "ISHA"] as const) {
    it(`${p} ضمن دقيقتين من المرجع`, () => {
      const diff = Math.abs(toMin(hhmmMakkah(computed[p])) - toMin(REF[p]));
      expect(diff).toBeLessThanOrEqual(2);
    });
  }

  it("خارج رمضان: العشاء = المغرب + ٩٠ دقيقة (أمّ القرى)", () => {
    expect(isRamadan(D)).toBe(false);
    expect((computed.ISHA.getTime() - computed.MAGHRIB.getTime()) / 60_000).toBe(90);
  });
});

describe("رمضان: العشاء = المغرب + ١٢٠ دقيقة", () => {
  it("يُحدَّد رمضان بتقويم أمّ القرى لا بتواريخ مكتوبة", () => {
    const R = "2026-03-01"; // هجريّ 12-09-1447 — رمضان
    expect(isRamadan(R)).toBe(true);
    const t = madinahPrayerTimes(R);
    expect((t.ISHA.getTime() - t.MAGHRIB.getTime()) / 60_000).toBe(120);
  });
});

describe("التعديل اليدويّ بالدقائق لكل صلاة", () => {
  it("يزيح وقت الصلاة بمقدار الدقائق، وافتراضيّه صفر", () => {
    const D = "2026-05-10";
    const base = madinahPrayerMs(D);
    const adj = madinahPrayerMs(D, { FAJR: 0, DHUHR: 0, ASR: 5, MAGHRIB: -3, ISHA: 0 });
    expect(adj.ASR - base.ASR).toBe(5 * 60_000);
    expect(adj.MAGHRIB - base.MAGHRIB).toBe(-3 * 60_000);
    expect(adj.FAJR).toBe(base.FAJR); // الافتراضيّ صفر
  });
});
