-- مراقي ٢: حقلا منهج الترسيخ والمراجعة لكلّ مسار (يضبطهما المدير) — بديلٌ عن الثابتين المكتوبين
-- TARSEEKH_WINDOW و CIRCLE_DAYS_PER_WEEK. يسبق ترحيلَ بيانات الوحدات «_maraqi_tracks_v2».
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "tarseekhUnits" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS "reviewDaysPerWeek" INTEGER NOT NULL DEFAULT 5;
