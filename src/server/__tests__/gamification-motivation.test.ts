import { describe, expect, it } from "vitest";

import { buildMotivations } from "../gamification/motivation";

// ل٥ (§٦): مُولّد رسائل التحفيز — أنواعٌ معرَّفة وقوالبُ بمتغيّرات (نقيّ).

describe("buildMotivations", () => {
  it("سلسلةٌ قائمةٌ لم تُتمّ اليوم ⟵ تحذير انقطاع بعدد أيّامها", () => {
    const ms = buildMotivations({ streakCurrent: 5, doneToday: false, nearestBadge: null, currentStation: null });
    const risk = ms.find((m) => m.type === "STREAK_AT_RISK");
    expect(risk).toBeDefined();
    expect(risk!.text).toContain("٥"); // أرقامٌ مشرقيّة
  });

  it("لا سلسلةَ ولم يُتمّ اليوم ⟵ رسالة الخطوة الأولى، بلا تحذير انقطاع", () => {
    const ms = buildMotivations({ streakCurrent: 0, doneToday: false, nearestBadge: null, currentStation: null });
    expect(ms.some((m) => m.type === "FIRST_STEP")).toBe(true);
    expect(ms.some((m) => m.type === "STREAK_AT_RISK")).toBe(false);
  });

  it("أتمّ اليوم ⟵ لا تحذير انقطاع ولا خطوة أولى", () => {
    const ms = buildMotivations({ streakCurrent: 5, doneToday: true, nearestBadge: null, currentStation: null });
    expect(ms.some((m) => m.type === "STREAK_AT_RISK")).toBe(false);
    expect(ms.some((m) => m.type === "FIRST_STEP")).toBe(false);
  });

  it("اقتراب وسامٍ ⟵ رسالةٌ باسمه والمتبقّي", () => {
    const ms = buildMotivations({ streakCurrent: 5, doneToday: true, nearestBadge: { remaining: 2, nameAr: "سلسلة ٧ أيّام" }, currentStation: null });
    const near = ms.find((m) => m.type === "BADGE_NEAR");
    expect(near).toBeDefined();
    expect(near!.text).toContain("سلسلة ٧ أيّام");
    expect(near!.text).toContain("٢");
  });

  it("تقدّم المحطّة الحاليّة ⟵ رسالةٌ بالمنجَز والمجموع والاسم", () => {
    const ms = buildMotivations({ streakCurrent: 0, doneToday: true, nearestBadge: null, currentStation: { done: 3, total: 6, label: "المرحلة ٢" } });
    const prog = ms.find((m) => m.type === "STATION_PROGRESS");
    expect(prog).toBeDefined();
    expect(prog!.text).toContain("٣");
    expect(prog!.text).toContain("٦");
    expect(prog!.text).toContain("المرحلة ٢");
  });
});
