import { describe, expect, it } from "vitest";

import { unifiedAr, tUnified } from "../ar/unified";

describe("قاموس الشاشة الموحّدة (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tUnified("newHifz")).toBe("الحفظ الجديد");
    expect(tUnified("viewList")).toBe("قائمة");
    expect(tUnified("viewCards")).toBe("بطاقات");
  });

  it("كلّ مفتاحٍ يُرجع نصّه الأصليّ حرفاً بحرف", () => {
    const expected: Record<keyof typeof unifiedAr, string> = {
      needLoginTeacherAdmin: "تحتاج دخولًا كمعلّم/إدارة.",
      loadFailed: "تعذّر التحميل. ",
      retry: "إعادة",
      absentDefaultNote: "الأصل اليوم «غياب»: من لم تَرفعه حاضرًا يُحسب غائبًا. أشِّر الحاضرين من اللوحة.",
      absentNotRaised: "غياب (لم يُرفَع)",
      notRaised: "لم يُرفَع",
      hifzDone: "حفظ ✓",
      pickStudent: "اختر طالبًا من القائمة.",
      excused: "مستأذن…",
      onStageLeave: "في إجازة اختبار المرحلة — لا وجهةَ حفظٍ اليوم.",
      noDailyTasks: "لا مهامّ يوميّة لهذا الطالب (ليس في مراقي ولا القاعدة المدنية).",
      newHifz: "الحفظ الجديد",
      trackCompleted: "أتمّ محفوظ مساره 🎉",
      trackNotSet: "لم يُحدَّد مساره بعد.",
      setTrackBtn: "تحديد المسار",
      rule1RepeatYesterday: "الحكم ١: يعيد مقطع أمس.",
      from: "من",
      to: "إلى",
      mastered: "أتقن",
      notMastered: "لم يُتقن",
      addMore: "+ زيادة",
      done: "تمّ",
      notDone: "لم يتمّ",
      doneF: "تمّت",
      notDoneF: "لم تتمّ",
      estimate: "تقدير",
      civilBase: "القاعدة المدنية",
      qaidahCurrentLesson: "القاعدة المدنية — الدرس الحاليّ",
      chapterPrefix: "الباب: ",
      todayPrefix: " · اليوم: ",
      qaidahMastered: "متقن",
      qaidahNotMastered: "غير متقن",
      qaidahDeferred: "مؤجَّل",
      noRasikhYet: "لا محفوظ راسخ بعد.",
      setPath: "تحديد المسار",
      assignTrackTitle: "تعيين المسار",
      suggestedTrack: "المقترح",
      selectTrack: "اختر المسار",
      saveTrack: "حفظ المسار",
      cancelBtn: "إلغاء",
      noteOptional: "ملاحظة (اختياريّة)",
      noteRequired: "السبب (مطلوب لمسارٍ أدنى من المقترح)",
      bulkAssignTracks: "تعيين جماعيّ",
      trackAssigned: "تمّ تعيين المسار.",
      trackAssignFailed: "تعذّر تعيين المسار.",
      autoAssignMissingBtn: "تعيين المسارات الناقصة",
      autoAssignDone: "عُيِّنت المسارات:",
      autoAssignProgress: "جارٍ تعيين المسارات…",
      viewList: "قائمة",
      viewCards: "بطاقات",
      stageLabelPrefix: "المرحلة: ",
      hizbInline: " · ح",
      yesterdayLabel: "أمس: ",
      notMasteredSuffix: " (لم يُتقن)",
      requiredTodayPrefix: "المطلوب: ",
      requiredTarseekhPrefix: "ترسيخ ",
      requiredKhumsPrefix: " · مراجعة أخماس ",
      weeklyCyclePrefix: "دورة الأسبوع: ",
      deferredTodayBadge: "مؤجَّل اليوم",
      deferBtn: "مؤجَّل",
      deferDone: "سُجِّل التأجيل.",
      declareReadinessBtn: "يستعدّ للحصاد",
      declareReadinessDone: "أُعلن الاستعداد.",
      detailLoading: "جارٍ تحميل التفاصيل…",
      detailLoadFailed: "تعذّر تحميل التفاصيل.",
      maraqiOnly: "التسجيل للمراقي فقط.",
      sessionRedirectNote: "الجلسة اليومية انتقلت إلى الشاشة الموحّدة.",
    };
    for (const key of Object.keys(expected) as (keyof typeof unifiedAr)[]) {
      expect(tUnified(key)).toBe(expected[key]);
    }
    expect(Object.keys(unifiedAr).length).toBe(Object.keys(expected).length);
  });
});
