-- تطوير القاعدة المدنية (QAIDAH_RULES.md): إضافة قيمتَي enum فقط — بلا استعمالٍ لهما هنا.
-- الاسم «9zzzzzzzz» (ثمانية z) ليُطبَّق معجميًّا بعد «9zzzzzzz_auto_grants».
-- ADD VALUE في PostgreSQL لا يجوز استعماله في المعاملة نفسها التي تُنشئه؛ لذا يُفصَل البذرُ
-- في ترحيلٍ لاحقٍ مستقلّ (9zzzzzzzzz_qaidah_lessons_seed).

-- StageKind: الدرس (وحدة الجلسة في القاعدة) — ابنٌ للباب عبر parentId.
ALTER TYPE "StageKind" ADD VALUE IF NOT EXISTS 'LESSON';

-- AutoEventType: إتمام القاعدة المدنية — يتيح للإدارة ربط بند نقاطٍ AUTO بحدث التخرّج (م٦أ-٢).
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'QAIDAH_COMPLETE';
