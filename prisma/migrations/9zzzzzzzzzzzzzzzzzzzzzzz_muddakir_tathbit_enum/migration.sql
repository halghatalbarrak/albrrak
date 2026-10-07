-- المُدَّكِر — التثبيت (§١٢): قيم التعداد فقط (قبل استعمالها). تُفصَل عن الترحيل الذي يُنشئ
-- الجداول ويستعمل القيم إلى «_muddakir_tathbit_setup» التالي — قيدُ Postgres: لا تُستعمل قيمةُ
-- enum مُضافةٌ في معاملتها (كنمط ترحيلات المُدَّكِر السابقة). نوع الطور enum جديدٌ يُنشأ هنا.
CREATE TYPE "MuddakirPhase" AS ENUM ('MEMORIZE', 'TATHBIT', 'PERMANENT');

ALTER TYPE "CertificateTemplate" ADD VALUE IF NOT EXISTS 'MUDDAKIR_TATHBIT';
ALTER TYPE "MuddakirRecitationKind" ADD VALUE IF NOT EXISTS 'TATHBIT_FINAL';
