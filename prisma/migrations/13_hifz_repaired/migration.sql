-- الحكم ٥ (الترميم الموضعيّ): خطآن في مراجعة المقطع ⟵ يعود حفظًا جديدًا.
-- حقلٌ على جلسة الحفظ يُخرج المقطع من الراسخ (يُعاد كجديد). إضافيّ آمن.
-- (Prisma يطبّق معجميًّا: 13 يعتمد DailySession من 0_init فقط — آمن.)
ALTER TABLE "DailySession" ADD COLUMN "repairedAt" TIMESTAMP(3);
