-- المُدَّكِر — المرحلة ٧: إضافة قيم enum فقط (قبل استعمالها). تُفصَل عن الترحيل الذي يُنشئ جدول
-- السرد ويستعمل القيم إلى «_muddakir_stages_setup» التالي — قيدُ Postgres: لا تُستعمل قيمةُ enum
-- مُضافةٌ في المعاملة نفسها (نمط «_muddakir_enum» و attendance add/migrate في هذا المستودع).
-- قوالب شهادة المُدَّكِر (نصّ المُدَّكِر الصحيح، لا «مراقي» ولا «الطالب») — §١/§٧.
ALTER TYPE "CertificateTemplate" ADD VALUE IF NOT EXISTS 'MUDDAKIR_STAGE';
ALTER TYPE "CertificateTemplate" ADD VALUE IF NOT EXISTS 'MUDDAKIR_KHATM';

-- مصدر خطأٍ للمختبِر في سرد المرحلة (يدخل علاج الأخطاء) — §٤٫٤/§٧.
ALTER TYPE "MuddakirErrorSource" ADD VALUE IF NOT EXISTS 'EXAMINER';
