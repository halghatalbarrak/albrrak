-- الحلقة لا تتبع برنامجاً (قرار المدير): الحلقة الواحدة قد تجمع طلاب برامج مختلفة،
-- والبرنامج صفةٌ في قيد الطالب (Enrollment.programId). ترحيلٌ إضافيّ بلا حذف، آمنٌ عند التكرار.

-- (أ) Circle.programId يصير اختياريًّا ومهجورًا — لا يُحذف العمود ولا قيد المفتاح الأجنبيّ.
ALTER TABLE "Circle" ALTER COLUMN "programId" DROP NOT NULL;

-- (ب) ملء برنامج القيد الناقص من برنامج الحلقة (backfill) — لا يلمس القيود المملوءة.
UPDATE "Enrollment" e
   SET "programId" = c."programId"
  FROM "Circle" c
 WHERE e."circleId" = c.id
   AND e."programId" IS NULL
   AND c."programId" IS NOT NULL;

-- لا جدول جديد: Circle وEnrollment مُقفلان بـRLS منذ ترحيل الإقفال، فلا شيء يُضاف هنا.
