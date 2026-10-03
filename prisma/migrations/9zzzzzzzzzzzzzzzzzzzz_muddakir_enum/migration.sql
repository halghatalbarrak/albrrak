-- المُدَّكِر — إضافة قيم enum فقط (ProgramKey + AutoEventType). تُفصَل عن الاستعمال
-- (بذر البرنامج يستعمل القيمة MUDDAKIR) إلى الترحيل التالي «_muddakir_setup» — قيدُ Postgres:
-- لا تُستعمل قيمةُ enum مُضافةٌ في المعاملة نفسها (كنمط attendance add/migrate في هذا المستودع).
ALTER TYPE "ProgramKey" ADD VALUE IF NOT EXISTS 'MUDDAKIR';

ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'MUDDAKIR_DAY_COMPLETE';
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'MUDDAKIR_FACE_HEARD';
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'MUDDAKIR_STAGE_COMPLETE';
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'MUDDAKIR_SHORTFALL';
