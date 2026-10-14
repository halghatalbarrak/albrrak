import { describe, expect, it } from "vitest";

import { studentsAr, tStudents } from "../ar/students";

describe("قاموس شاشات الطلاب (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tStudents("acceptedStudents")).toBe("الطلاب المقبولون");
    expect(tStudents("colName")).toBe("الاسم");
    expect(tStudents("savePlacement")).toBe("حفظ التسكين");
  });

  it("كلّ مفتاحٍ يُرجع نصّه الأصليّ حرفاً بحرف", () => {
    const expected: Record<keyof typeof studentsAr, string> = {
      // القائمة — حالات الطالب (STATE_AR)
      stateApplied: "مُقدَّم",
      statePendingAcceptance: "بانتظار القبول",
      stateWaitlisted: "قائمة الانتظار",
      stateRejected: "مرفوض",
      stateAwaitingReadingTest: "بانتظار اختبار القراءة",
      stateInQaidah: "في القاعدة المدنية",
      stateAwaitingPaceTest: "بانتظار اختبار المقطع",
      statePaceRetestScheduled: "إعادة اختبار المقطع",
      stateInMaraqi: "في المراقي",
      stateCompleted: "أتمّ",
      stateWithdrawn: "منسحب",
      // نموذج اختبار القراءة
      readingTestFailed: "تعذّر تسجيل الاختبار.",
      readsFluently: "يجيد القراءة نظراً",
      toPaceTest: "← بانتظار اختبار المقطع",
      toQaidahCircle: "← القاعدة المدنية + حلقة",
      qaidahCircleLabel: "حلقة القاعدة المدنية",
      chooseEllipsis: "اختر…",
      examinerNotes: "ملاحظات المختبِر",
      submitForApproval: "رفع القرار للاعتماد",
      // جلب/أخطاء القائمة
      noPermissionStaff: "لا صلاحية — هذه الشاشة للكادر الإداري.",
      fetchStudentsFailed: "تعذّر جلب الطلاب.",
      connectFailed: "تعذّر الاتصال بالخادم.",
      revealIdFailed: "تعذّر كشف رقم الهوية.",
      rejectReasonPrompt: "سبب الرفض (إلزامي):",
      decideFailed: "تعذّر تنفيذ القرار.",
      // أعمدة الجدول والإجراءات
      colName: "الاسم",
      colState: "الحالة",
      colAge: "العمر",
      colCircle: "الحلقة",
      colGuardian: "ولي الأمر",
      colActions: "إجراءات",
      notAssigned: "لم تُسنَد",
      approve: "اعتمِد",
      reject: "ارفض",
      readingTest: "اختبار القراءة",
      weaknessMap: "الخريطة",
      placement: "تسكين",
      revealId: "كشف الهوية",
      idPrefix: "الهوية:",
      // عناوين ومسار التنقّل
      acceptedStudents: "الطلاب المقبولون",
      crumbHome: "الرئيسة",
      crumbAdmin: "الإدارة",
      crumbStudents: "الطلاب",
      noAcceptedStudents: "لا طلاب مقبولون بعد",
      pendingStudentsSuffix: " طالبٍ بانتظار اعتماد تحديدك — راجِعهم.",
      pendingDecisionsBadge: "قرارات تحديدٍ معلّقة",
      readingTestModalPrefix: "اختبار القراءة — ",
      // التسكين — أسباب التاريخ (REASON_AR)
      reasonAssignment: "إسناد أوّليّ",
      reasonReadingTest: "اختبار قراءة",
      reasonGraduation: "تخرّج",
      reasonChange: "تغيير إداريّ",
      // أسماء البرامج (PROG_AR)
      progQaidah: "القاعدة المدنية",
      progMaraqi: "مراقي",
      progWeekly: "الأسبوعيّ",
      // جلب/رسائل التسكين
      placementNoPermission: "لا صلاحية — التسكين للمشرف/المدير (ق٧).",
      fetchPlacementFailed: "تعذّر جلب بيانات التسكين.",
      executeFailed: "تعذّر التنفيذ.",
      loading: "جارٍ التحميل…",
      programChanged: "تغيّر البرنامج.",
      placedOnQaidah: "سُكِّن على القاعدة.",
      placedOnMaraqi: "سُكِّن على مراقي.",
      // مسار التنقّل — التسكين
      placementTitlePrefix: "تسكين: ",
      crumbPlacement: "تسكين",
      // تاريخ البرامج
      colProgram: "البرنامج",
      colIn: "دخل",
      colOut: "خرج",
      stillActive: "— (نشط)",
      colReason: "السبب",
      colActor: "الفاعل",
      systemActor: "النظام",
      programHistoryTitle: "تاريخ البرامج",
      // تغيير البرنامج
      programTitle: "البرنامج",
      noProgram: "بلا برنامج",
      movesToPrefix: "ينتقل إلى ",
      movesToIn: " في ",
      changeProgram: "تغيير البرنامج",
      changeCancelsPending: "تغيير البرنامج الآن يُلغي الانتقال المعلّق.",
      // تسكين القاعدة
      qaidahPlacementTitle: "تسكين القاعدة — الدرس الحاليّ",
      currentLessonLabel: "الدرس الحاليّ للطالب",
      lessonsBeforePrefix: "ستُكمَّل ",
      lessonsBeforeSuffix: " درسًا قبله (تسكينًا، بلا نقاط)، ويبدأ من هذا الدرس.",
      savePlacement: "حفظ التسكين",
      // تسكين مراقي
      maraqiPlacementTitle: "تسكين مراقي — تأشير المحفوظ",
      fullyMemorizedJuz: "الأجزاء المحفوظة كاملةً",
      juzWord: "جزء",
      reachedPointLabel: "موضع الوصول في الجزء الجاري (اسم السورة ثمّ الآية)",
      reachedPointNote: "محفوظٌ من أوّل الجزء بترتيب مراقي (السور تنازليّاً) حتى هذا الموضع.",
      chooseSurah: "— اختر السورة —",
      ayahPlaceholder: "آية",
      clear: "مسح",
      singleSurahsTitle: "سورٌ مفردة خارج الترتيب (بأسمائها)",
      surahSearchPlaceholder: "ابحث باسم السورة…",
      preciseRangesToggle: "نطاقاتٌ دقيقة (متقدّم)",
      delete: "حذف",
      rangeFrom: "من",
      surahPlaceholder: "سورة",
      rangeTo: "إلى",
      addRange: "+ نطاق",
      previewReachedLabel: "الجبهة المسكَّنة (محفوظٌ بالترتيب حتى): ",
      previewNone: "—",
      previewCurrentJuzLabel: "محفوظٌ من الجزء الجاري: ",
      previewOutOfOrderLabel: "خارج الترتيب: ",
      previewOutOfOrderNone: "لا شيء",
      previewFootnote: "الحفظ الجديد يبدأ بعد الجبهة ويتخطّى المحفوظ خارج الترتيب. الحدود الدقيقة تُحسب عند الحفظ من وحدات المسار.",
      // خريطة الضعف
      weaknessNoPermission: "لا صلاحية — لا تَرى إلا خرائط طلابك.",
      fetchMapFailed: "تعذّر جلب الخريطة.",
      weaknessMapTitlePrefix: "خريطة الضعف",
      crumbWeaknessMap: "الخريطة",
      noErrorsYet: "لا مواضع خطأٍ مسجّلة بعد",
      noErrorsYetDesc: "تظهر الخريطة بعد حصادٍ تُرصد فيه أخطاءٌ عند الآيات.",
      totalErrorsPrefix: "مجموع الأخطاء المسجَّلة: ",
      totalErrorsMid: " على ",
      totalErrorsSuffix: " وجهًا.",
      heatHint: "كلّما اشتدّ البرونزيّ كثُر الخطأ.",
      mostErrorsTitle: "أكثر المواضع خطأً",
      surahWord: "سورة",
      ayahWord: "آية",
      onceWord: "مرّة",
      manyTimesWord: "مرّات",
      facesTitle: "الأوجه",
      facePagePrefix: "وجه ص",
      positionsSuffix: "موضعًا",
    };
    for (const key of Object.keys(expected) as (keyof typeof studentsAr)[]) {
      expect(tStudents(key)).toBe(expected[key]);
    }
    // لا مفتاح خارج التحقّق: عدد مفاتيح القاموس = عدد المفاتيح المتوقَّعة.
    expect(Object.keys(studentsAr).length).toBe(Object.keys(expected).length);
  });
});
