-- فهرس على Purchase.marketItemId لتسريع تقارير «كم بِيع من هذا البند؟»
-- الجدول صغير حاليّاً، لكنّ الفهرس ضروريّ قبل أن تنمو البيانات.
-- CONCURRENTLY غير مدعوم داخل كتلة DO، فنُضيف الفهرس بشكلٍ مباشر.
-- أمانٌ: CREATE INDEX بلا UNIQUE لا يُقيَّد بقفل كتابة.
CREATE INDEX IF NOT EXISTS "Purchase_marketItemId_idx" ON "Purchase"("marketItemId");
