-- مراقي ٢ (القرار أ): حدود المراحل الستّ بالسور على MAIN_STAGE (تحلّ محلّ تجميع الأحزاب في
-- حساب المرحلة/الاختبار/الإجازة/خريطة الطريق). الحفظ تنازليّ: المرحلة مدىً في ترتيب الحفظ
-- (الفاتحة ثمّ الناس نزولاً). from = أوّل سورةٍ في المرحلة (آية ١)، to = سورة الحدّ وآخر آيةٍ فيها
-- (من بيانات المصحف MushafLine). لا FK، لا حذف — تحديثٌ لأعمدةٍ قائمةٍ كانت فارغةً على MAIN_STAGE.
UPDATE "Stage" SET "fromSurah" = 1,  "fromAyah" = 1, "toSurah" = 46, "toAyah" = 35  WHERE "id" = 'mrq_main_1';
UPDATE "Stage" SET "fromSurah" = 45, "fromAyah" = 1, "toSurah" = 29, "toAyah" = 69  WHERE "id" = 'mrq_main_2';
UPDATE "Stage" SET "fromSurah" = 28, "fromAyah" = 1, "toSurah" = 18, "toAyah" = 110 WHERE "id" = 'mrq_main_3';
UPDATE "Stage" SET "fromSurah" = 17, "fromAyah" = 1, "toSurah" = 10, "toAyah" = 109 WHERE "id" = 'mrq_main_4';
UPDATE "Stage" SET "fromSurah" = 9,  "fromAyah" = 1, "toSurah" = 5,  "toAyah" = 120 WHERE "id" = 'mrq_main_5';
UPDATE "Stage" SET "fromSurah" = 4,  "fromAyah" = 1, "toSurah" = 2,  "toAyah" = 286 WHERE "id" = 'mrq_main_6';
