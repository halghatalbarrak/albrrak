import { describe, expect, it } from "vitest";

import { makkahDayBounds } from "@/lib/makkah-day";
import { pickActiveWindow, resolveWindow, weekdayOf, type ScheduleDef } from "@/lib/display-schedule";
import { madinahPrayerMs, madinahPrayerTimes } from "../display/prayer-times";

// جدولة الشاشة بأوقات الصلاة (DISPLAY_SCREEN_RULES §١٠) — اختباراتٌ نقيّةٌ بلحظاتٍ مطلقة،
// محسوبةٌ من وقت العصر للمدينة المنوّرة في تاريخٍ ثابت (لا أوقاتٌ ثابتةٌ مكتوبة).

const D = "2026-05-10"; // تاريخٌ ثابت بتوقيت مكّة
const prayers = madinahPrayerTimes(D);
const prayerMs = madinahPrayerMs(D);
const mid = makkahDayBounds(D).start.getTime();
const ASR = prayers.ASR.getTime();

function def(over: Partial<ScheduleDef> = {}): ScheduleDef {
  return { id: "x", ordinal: 0, startMode: "PRAYER", prayer: "ASR", rel: "AFTER", offsetMin: 10, fixedTime: null, durationMin: 30, daysMask: 127, active: true, ...over };
}

describe("الموعد يُحسب من وقت العصر للمدينة", () => {
  it("«بعد العصر ١٠د لمدّة ٣٠د» = نافذةٌ من العصر+١٠ إلى +٤٠", () => {
    const w = resolveWindow(def(), D, prayerMs, mid)!;
    expect(w).not.toBeNull();
    expect(w.startMs).toBe(ASR + 10 * 60_000);
    expect(w.endMs).toBe(ASR + 40 * 60_000);
  });

  it("«قبل العصر» يطرح الإزاحة", () => {
    const w = resolveWindow(def({ rel: "BEFORE", offsetMin: 15 }), D, prayerMs, mid)!;
    expect(w.startMs).toBe(ASR - 15 * 60_000);
  });
});

describe("التفعيل داخل النافذة وخارجها", () => {
  const w = resolveWindow(def(), D, prayerMs, mid)!;
  it("يُفعَّل داخل نافذته", () => {
    expect(pickActiveWindow([w], w.startMs + 5 * 60_000)).toBe(w);
  });
  it("خارجها تعود الدورة الافتراضيّة (null)", () => {
    expect(pickActiveWindow([w], w.startMs - 60_000)).toBeNull();
    expect(pickActiveWindow([w], w.endMs + 60_000)).toBeNull();
  });
});

describe("الحدود الزمنيّة", () => {
  const w = resolveWindow(def(), D, prayerMs, mid)!;
  it("البداية شاملة، والنهاية حصريّة", () => {
    expect(pickActiveWindow([w], w.startMs)).toBe(w); // بداية الموعد
    expect(pickActiveWindow([w], w.endMs - 1)).toBe(w); // آخر لحظة
    expect(pickActiveWindow([w], w.endMs)).toBeNull(); // نهاية الموعد — خارج
    expect(pickActiveWindow([w], w.startMs - 1)).toBeNull(); // قُبيل البداية — خارج
  });
});

describe("الأيّام المحدّدة تُحترم", () => {
  it("ينطبق على يومه، ويُسقَط في غيره", () => {
    const wd = weekdayOf(D);
    expect(resolveWindow(def({ daysMask: 1 << wd }), D, prayerMs, mid)).not.toBeNull();
    expect(resolveWindow(def({ daysMask: 1 << ((wd + 1) % 7) }), D, prayerMs, mid)).toBeNull();
  });
});

describe("التداخل: الأعلى ترتيباً يغلب", () => {
  it("عند لحظةٍ داخل موعدَين متداخلَين يُختار الأصغر ترتيباً", () => {
    const a = def({ id: "A", ordinal: 0 });
    const b = def({ id: "B", ordinal: 1, offsetMin: 20 }); // يتداخل مع A
    const wa = resolveWindow(a, D, prayerMs, mid)!;
    const wb = resolveWindow(b, D, prayerMs, mid)!;
    const now = ASR + 25 * 60_000; // داخل كليهما
    expect(pickActiveWindow([wa, wb], now)!.id).toBe("A");
  });
});

describe("حالاتٌ أخرى", () => {
  it("المعطَّل لا يُحسب", () => {
    expect(resolveWindow(def({ active: false }), D, prayerMs, mid)).toBeNull();
  });
  it("الساعة الثابتة بتوقيت مكّة", () => {
    const w = resolveWindow(def({ startMode: "FIXED", fixedTime: "16:00", prayer: null, rel: null }), D, prayerMs, mid)!;
    expect(w.startMs).toBe(mid + 16 * 60 * 60_000);
  });
});
