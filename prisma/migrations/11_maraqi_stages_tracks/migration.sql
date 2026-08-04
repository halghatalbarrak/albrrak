-- م٤أ (مراقي): المراحل والمسارات وحدود الأحزاب. إضافيّ نظيف.
--  • HizbBoundary: مرجع الأحزاب الستين (يُبذر من hizb_boundaries.json الموقَّع).
--  • Stage.hizbNumber: ربط المرحلة الفرعية بحزبها (الإدارة ترى الحزب؛ الطالب لا).
--  • PaceTest.passageId: يصير اختياريًّا — بنك المقاطع (§٨٫٥) مؤجَّلٌ لدفعةٍ لاحقة.
-- البذر بعده مولَّدٌ من الملف (لا حدَّ حزبٍ من الذاكرة).

-- ── مخطط ──
CREATE TABLE "HizbBoundary" (
    "hizb" INTEGER NOT NULL,
    "juz" INTEGER NOT NULL,
    "startSurahNum" INTEGER NOT NULL,
    "startSurah" TEXT NOT NULL,
    "startAyah" INTEGER NOT NULL,
    "endSurahNum" INTEGER NOT NULL,
    "endSurah" TEXT NOT NULL,
    "endAyah" INTEGER NOT NULL,
    CONSTRAINT "HizbBoundary_pkey" PRIMARY KEY ("hizb")
);

ALTER TABLE "Stage" ADD COLUMN "hizbNumber" INTEGER;

ALTER TABLE "PaceTest" ALTER COLUMN "passageId" DROP NOT NULL;

-- برنامج مراقي — يُبذر هنا أيضًا (idempotent) لأن Prisma يطبّق الترحيلات ترتيبًا
-- معجميًّا (0,1,10,11,2,…,9)، فيسبق هذا الترحيلُ 8_seed_programs. تكراره في 8 لا يضرّ.
INSERT INTO "Program" ("id", "key", "nameAr") VALUES
  ('prog_maraqi', 'MARAQI', 'مراقي')
ON CONFLICT ("key") DO NOTHING;

-- م٤أ: بذر مراقي — مولَّدٌ من hizb_boundaries.json (توقيع محمد، مصحف المدينة).
-- الأحزاب من الملف حرفيًّا. المراحل والمسارات بنيةٌ من DESIGN §٨. آمنة التكرار.

INSERT INTO "HizbBoundary" ("hizb","juz","startSurahNum","startSurah","startAyah","endSurahNum","endSurah","endAyah") VALUES
  (1, 1, 1, 'الفاتحة', 1, 2, 'البقرة', 74),
  (2, 1, 2, 'البقرة', 75, 2, 'البقرة', 141),
  (3, 2, 2, 'البقرة', 142, 2, 'البقرة', 202),
  (4, 2, 2, 'البقرة', 203, 2, 'البقرة', 252),
  (5, 3, 2, 'البقرة', 253, 3, 'آل عمران', 14),
  (6, 3, 3, 'آل عمران', 15, 3, 'آل عمران', 92),
  (7, 4, 3, 'آل عمران', 93, 3, 'آل عمران', 170),
  (8, 4, 3, 'آل عمران', 171, 4, 'النساء', 23),
  (9, 5, 4, 'النساء', 24, 4, 'النساء', 87),
  (10, 5, 4, 'النساء', 88, 4, 'النساء', 147),
  (11, 6, 4, 'النساء', 148, 5, 'المائدة', 26),
  (12, 6, 5, 'المائدة', 27, 5, 'المائدة', 81),
  (13, 7, 5, 'المائدة', 82, 6, 'الأنعام', 35),
  (14, 7, 6, 'الأنعام', 36, 6, 'الأنعام', 110),
  (15, 8, 6, 'الأنعام', 111, 6, 'الأنعام', 165),
  (16, 8, 7, 'الأعراف', 1, 7, 'الأعراف', 87),
  (17, 9, 7, 'الأعراف', 88, 7, 'الأعراف', 170),
  (18, 9, 7, 'الأعراف', 171, 8, 'الأنفال', 40),
  (19, 10, 8, 'الأنفال', 41, 9, 'التوبة', 33),
  (20, 10, 9, 'التوبة', 34, 9, 'التوبة', 92),
  (21, 11, 9, 'التوبة', 93, 10, 'يونس', 25),
  (22, 11, 10, 'يونس', 26, 11, 'هود', 5),
  (23, 12, 11, 'هود', 6, 11, 'هود', 83),
  (24, 12, 11, 'هود', 84, 12, 'يوسف', 52),
  (25, 13, 12, 'يوسف', 53, 13, 'الرعد', 18),
  (26, 13, 13, 'الرعد', 19, 14, 'إبراهيم', 52),
  (27, 14, 15, 'الحجر', 1, 16, 'النحل', 50),
  (28, 14, 16, 'النحل', 51, 16, 'النحل', 128),
  (29, 15, 17, 'الإسراء', 1, 17, 'الإسراء', 98),
  (30, 15, 17, 'الإسراء', 99, 18, 'الكهف', 74),
  (31, 16, 18, 'الكهف', 75, 19, 'مريم', 98),
  (32, 16, 20, 'طه', 1, 20, 'طه', 135),
  (33, 17, 21, 'الأنبياء', 1, 21, 'الأنبياء', 112),
  (34, 17, 22, 'الحج', 1, 22, 'الحج', 78),
  (35, 18, 23, 'المؤمنون', 1, 24, 'النور', 20),
  (36, 18, 24, 'النور', 21, 25, 'الفرقان', 20),
  (37, 19, 25, 'الفرقان', 21, 26, 'الشعراء', 110),
  (38, 19, 26, 'الشعراء', 111, 27, 'النمل', 55),
  (39, 20, 27, 'النمل', 56, 28, 'القصص', 50),
  (40, 20, 28, 'القصص', 51, 29, 'العنكبوت', 45),
  (41, 21, 29, 'العنكبوت', 46, 31, 'لقمان', 21),
  (42, 21, 31, 'لقمان', 22, 33, 'الأحزاب', 30),
  (43, 22, 33, 'الأحزاب', 31, 34, 'سبأ', 23),
  (44, 22, 34, 'سبأ', 24, 36, 'يس', 27),
  (45, 23, 36, 'يس', 28, 37, 'الصافات', 144),
  (46, 23, 37, 'الصافات', 145, 39, 'الزمر', 31),
  (47, 24, 39, 'الزمر', 32, 40, 'غافر', 40),
  (48, 24, 40, 'غافر', 41, 41, 'فصلت', 46),
  (49, 25, 41, 'فصلت', 47, 43, 'الزخرف', 23),
  (50, 25, 43, 'الزخرف', 24, 45, 'الجاثية', 37),
  (51, 26, 46, 'الأحقاف', 1, 48, 'الفتح', 17),
  (52, 26, 48, 'الفتح', 18, 51, 'الذاريات', 30),
  (53, 27, 51, 'الذاريات', 31, 54, 'القمر', 55),
  (54, 27, 55, 'الرحمن', 1, 57, 'الحديد', 29),
  (55, 28, 58, 'المجادلة', 1, 61, 'الصف', 14),
  (56, 28, 62, 'الجمعة', 1, 66, 'التحريم', 12),
  (57, 29, 67, 'الملك', 1, 71, 'نوح', 28),
  (58, 29, 72, 'الجن', 1, 77, 'المرسلات', 50),
  (59, 30, 78, 'النبأ', 1, 86, 'الطارق', 17),
  (60, 30, 87, 'الأعلى', 1, 114, 'الناس', 6)
ON CONFLICT ("hizb") DO NOTHING;

INSERT INTO "Stage" ("id","programId","kind","ordinal","nameAr","objectives") VALUES
  ('mrq_main_1', 'prog_maraqi', 'MAIN_STAGE', 1, 'المرحلة الأصلية الأولى', '{"juz":[30,29,28,27,26]}'::jsonb),
  ('mrq_main_2', 'prog_maraqi', 'MAIN_STAGE', 2, 'المرحلة الأصلية الثانية', '{"juz":[25,24,23,22,21]}'::jsonb),
  ('mrq_main_3', 'prog_maraqi', 'MAIN_STAGE', 3, 'المرحلة الأصلية الثالثة', '{"juz":[20,19,18,17,16]}'::jsonb),
  ('mrq_main_4', 'prog_maraqi', 'MAIN_STAGE', 4, 'المرحلة الأصلية الرابعة', '{"juz":[15,14,13,12,11]}'::jsonb),
  ('mrq_main_5', 'prog_maraqi', 'MAIN_STAGE', 5, 'المرحلة الأصلية الخامسة', '{"juz":[10,9,8,7,6]}'::jsonb),
  ('mrq_main_6', 'prog_maraqi', 'MAIN_STAGE', 6, 'المرحلة الأصلية السادسة', '{"juz":[5,4,3,2,1]}'::jsonb)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Stage" ("id","programId","kind","ordinal","nameAr","weight","fromSurah","fromAyah","toSurah","toAyah") VALUES
  ('mrq_prelude_fatiha', 'prog_maraqi', 'CHAPTER', 0, 'الفاتحة (تمهيد)', 0, 1, 1, 1, 7)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Stage" ("id","programId","kind","ordinal","nameAr","parentId","weight","hizbNumber","fromSurah","fromAyah","toSurah","toAyah") VALUES
  ('mrq_sub_h1', 'prog_maraqi', 'SUB_STAGE', 60, 'البقرة 1 - البقرة 74', 'mrq_main_6', 1, 1, 2, 1, 2, 74),
  ('mrq_sub_h2', 'prog_maraqi', 'SUB_STAGE', 59, 'البقرة 75 - البقرة 141', 'mrq_main_6', 1, 2, 2, 75, 2, 141),
  ('mrq_sub_h3', 'prog_maraqi', 'SUB_STAGE', 58, 'البقرة 142 - البقرة 202', 'mrq_main_6', 1, 3, 2, 142, 2, 202),
  ('mrq_sub_h4', 'prog_maraqi', 'SUB_STAGE', 57, 'البقرة 203 - البقرة 252', 'mrq_main_6', 1, 4, 2, 203, 2, 252),
  ('mrq_sub_h5', 'prog_maraqi', 'SUB_STAGE', 56, 'البقرة 253 - آل عمران 14', 'mrq_main_6', 1, 5, 2, 253, 3, 14),
  ('mrq_sub_h6', 'prog_maraqi', 'SUB_STAGE', 55, 'آل عمران 15 - آل عمران 92', 'mrq_main_6', 1, 6, 3, 15, 3, 92),
  ('mrq_sub_h7', 'prog_maraqi', 'SUB_STAGE', 54, 'آل عمران 93 - آل عمران 170', 'mrq_main_6', 1, 7, 3, 93, 3, 170),
  ('mrq_sub_h8', 'prog_maraqi', 'SUB_STAGE', 53, 'آل عمران 171 - النساء 23', 'mrq_main_6', 1, 8, 3, 171, 4, 23),
  ('mrq_sub_h9', 'prog_maraqi', 'SUB_STAGE', 52, 'النساء 24 - النساء 87', 'mrq_main_6', 1, 9, 4, 24, 4, 87),
  ('mrq_sub_h10', 'prog_maraqi', 'SUB_STAGE', 51, 'النساء 88 - النساء 147', 'mrq_main_6', 1, 10, 4, 88, 4, 147),
  ('mrq_sub_h11', 'prog_maraqi', 'SUB_STAGE', 50, 'النساء 148 - المائدة 26', 'mrq_main_5', 1, 11, 4, 148, 5, 26),
  ('mrq_sub_h12', 'prog_maraqi', 'SUB_STAGE', 49, 'المائدة 27 - المائدة 81', 'mrq_main_5', 1, 12, 5, 27, 5, 81),
  ('mrq_sub_h13', 'prog_maraqi', 'SUB_STAGE', 48, 'المائدة 82 - الأنعام 35', 'mrq_main_5', 1, 13, 5, 82, 6, 35),
  ('mrq_sub_h14', 'prog_maraqi', 'SUB_STAGE', 47, 'الأنعام 36 - الأنعام 110', 'mrq_main_5', 1, 14, 6, 36, 6, 110),
  ('mrq_sub_h15', 'prog_maraqi', 'SUB_STAGE', 46, 'الأنعام 111 - الأنعام 165', 'mrq_main_5', 1, 15, 6, 111, 6, 165),
  ('mrq_sub_h16', 'prog_maraqi', 'SUB_STAGE', 45, 'الأعراف 1 - الأعراف 87', 'mrq_main_5', 1, 16, 7, 1, 7, 87),
  ('mrq_sub_h17', 'prog_maraqi', 'SUB_STAGE', 44, 'الأعراف 88 - الأعراف 170', 'mrq_main_5', 1, 17, 7, 88, 7, 170),
  ('mrq_sub_h18', 'prog_maraqi', 'SUB_STAGE', 43, 'الأعراف 171 - الأنفال 40', 'mrq_main_5', 1, 18, 7, 171, 8, 40),
  ('mrq_sub_h19', 'prog_maraqi', 'SUB_STAGE', 42, 'الأنفال 41 - التوبة 33', 'mrq_main_5', 1, 19, 8, 41, 9, 33),
  ('mrq_sub_h20', 'prog_maraqi', 'SUB_STAGE', 41, 'التوبة 34 - التوبة 92', 'mrq_main_5', 1, 20, 9, 34, 9, 92),
  ('mrq_sub_h21', 'prog_maraqi', 'SUB_STAGE', 40, 'التوبة 93 - يونس 25', 'mrq_main_4', 1, 21, 9, 93, 10, 25),
  ('mrq_sub_h22', 'prog_maraqi', 'SUB_STAGE', 39, 'يونس 26 - هود 5', 'mrq_main_4', 1, 22, 10, 26, 11, 5),
  ('mrq_sub_h23', 'prog_maraqi', 'SUB_STAGE', 38, 'هود 6 - هود 83', 'mrq_main_4', 1, 23, 11, 6, 11, 83),
  ('mrq_sub_h24', 'prog_maraqi', 'SUB_STAGE', 37, 'هود 84 - يوسف 52', 'mrq_main_4', 1, 24, 11, 84, 12, 52),
  ('mrq_sub_h25', 'prog_maraqi', 'SUB_STAGE', 36, 'يوسف 53 - الرعد 18', 'mrq_main_4', 1, 25, 12, 53, 13, 18),
  ('mrq_sub_h26', 'prog_maraqi', 'SUB_STAGE', 35, 'الرعد 19 - إبراهيم 52', 'mrq_main_4', 1, 26, 13, 19, 14, 52),
  ('mrq_sub_h27', 'prog_maraqi', 'SUB_STAGE', 34, 'الحجر 1 - النحل 50', 'mrq_main_4', 1, 27, 15, 1, 16, 50),
  ('mrq_sub_h28', 'prog_maraqi', 'SUB_STAGE', 33, 'النحل 51 - النحل 128', 'mrq_main_4', 1, 28, 16, 51, 16, 128),
  ('mrq_sub_h29', 'prog_maraqi', 'SUB_STAGE', 32, 'الإسراء 1 - الإسراء 98', 'mrq_main_4', 1, 29, 17, 1, 17, 98),
  ('mrq_sub_h30', 'prog_maraqi', 'SUB_STAGE', 31, 'الإسراء 99 - الكهف 74', 'mrq_main_4', 1, 30, 17, 99, 18, 74),
  ('mrq_sub_h31', 'prog_maraqi', 'SUB_STAGE', 30, 'الكهف 75 - مريم 98', 'mrq_main_3', 1, 31, 18, 75, 19, 98),
  ('mrq_sub_h32', 'prog_maraqi', 'SUB_STAGE', 29, 'طه 1 - طه 135', 'mrq_main_3', 1, 32, 20, 1, 20, 135),
  ('mrq_sub_h33', 'prog_maraqi', 'SUB_STAGE', 28, 'الأنبياء 1 - الأنبياء 112', 'mrq_main_3', 1, 33, 21, 1, 21, 112),
  ('mrq_sub_h34', 'prog_maraqi', 'SUB_STAGE', 27, 'الحج 1 - الحج 78', 'mrq_main_3', 1, 34, 22, 1, 22, 78),
  ('mrq_sub_h35', 'prog_maraqi', 'SUB_STAGE', 26, 'المؤمنون 1 - النور 20', 'mrq_main_3', 1, 35, 23, 1, 24, 20),
  ('mrq_sub_h36', 'prog_maraqi', 'SUB_STAGE', 25, 'النور 21 - الفرقان 20', 'mrq_main_3', 1, 36, 24, 21, 25, 20),
  ('mrq_sub_h37', 'prog_maraqi', 'SUB_STAGE', 24, 'الفرقان 21 - الشعراء 110', 'mrq_main_3', 1, 37, 25, 21, 26, 110),
  ('mrq_sub_h38', 'prog_maraqi', 'SUB_STAGE', 23, 'الشعراء 111 - النمل 55', 'mrq_main_3', 1, 38, 26, 111, 27, 55),
  ('mrq_sub_h39', 'prog_maraqi', 'SUB_STAGE', 22, 'النمل 56 - القصص 50', 'mrq_main_3', 1, 39, 27, 56, 28, 50),
  ('mrq_sub_h40', 'prog_maraqi', 'SUB_STAGE', 21, 'القصص 51 - العنكبوت 45', 'mrq_main_3', 1, 40, 28, 51, 29, 45),
  ('mrq_sub_h41', 'prog_maraqi', 'SUB_STAGE', 20, 'العنكبوت 46 - لقمان 21', 'mrq_main_2', 1, 41, 29, 46, 31, 21),
  ('mrq_sub_h42', 'prog_maraqi', 'SUB_STAGE', 19, 'لقمان 22 - الأحزاب 30', 'mrq_main_2', 1, 42, 31, 22, 33, 30),
  ('mrq_sub_h43', 'prog_maraqi', 'SUB_STAGE', 18, 'الأحزاب 31 - سبأ 23', 'mrq_main_2', 1, 43, 33, 31, 34, 23),
  ('mrq_sub_h44', 'prog_maraqi', 'SUB_STAGE', 17, 'سبأ 24 - يس 27', 'mrq_main_2', 1, 44, 34, 24, 36, 27),
  ('mrq_sub_h45', 'prog_maraqi', 'SUB_STAGE', 16, 'يس 28 - الصافات 144', 'mrq_main_2', 1, 45, 36, 28, 37, 144),
  ('mrq_sub_h46', 'prog_maraqi', 'SUB_STAGE', 15, 'الصافات 145 - الزمر 31', 'mrq_main_2', 1, 46, 37, 145, 39, 31),
  ('mrq_sub_h47', 'prog_maraqi', 'SUB_STAGE', 14, 'الزمر 32 - غافر 40', 'mrq_main_2', 1, 47, 39, 32, 40, 40),
  ('mrq_sub_h48', 'prog_maraqi', 'SUB_STAGE', 13, 'غافر 41 - فصلت 46', 'mrq_main_2', 1, 48, 40, 41, 41, 46),
  ('mrq_sub_h49', 'prog_maraqi', 'SUB_STAGE', 12, 'فصلت 47 - الزخرف 23', 'mrq_main_2', 1, 49, 41, 47, 43, 23),
  ('mrq_sub_h50', 'prog_maraqi', 'SUB_STAGE', 11, 'الزخرف 24 - الجاثية 37', 'mrq_main_2', 1, 50, 43, 24, 45, 37),
  ('mrq_sub_h51', 'prog_maraqi', 'SUB_STAGE', 10, 'الأحقاف 1 - الفتح 17', 'mrq_main_1', 1, 51, 46, 1, 48, 17),
  ('mrq_sub_h52', 'prog_maraqi', 'SUB_STAGE', 9, 'الفتح 18 - الذاريات 30', 'mrq_main_1', 1, 52, 48, 18, 51, 30),
  ('mrq_sub_h53', 'prog_maraqi', 'SUB_STAGE', 8, 'الذاريات 31 - القمر 55', 'mrq_main_1', 1, 53, 51, 31, 54, 55),
  ('mrq_sub_h54', 'prog_maraqi', 'SUB_STAGE', 7, 'الرحمن 1 - الحديد 29', 'mrq_main_1', 1, 54, 55, 1, 57, 29),
  ('mrq_sub_h55', 'prog_maraqi', 'SUB_STAGE', 6, 'المجادلة 1 - الصف 14', 'mrq_main_1', 1, 55, 58, 1, 61, 14),
  ('mrq_sub_h56', 'prog_maraqi', 'SUB_STAGE', 5, 'الجمعة 1 - التحريم 12', 'mrq_main_1', 1, 56, 62, 1, 66, 12),
  ('mrq_sub_h57', 'prog_maraqi', 'SUB_STAGE', 4, 'الملك 1 - نوح 28', 'mrq_main_1', 1, 57, 67, 1, 71, 28),
  ('mrq_sub_h58', 'prog_maraqi', 'SUB_STAGE', 3, 'الجن 1 - المرسلات 50', 'mrq_main_1', 1, 58, 72, 1, 77, 50),
  ('mrq_sub_h59', 'prog_maraqi', 'SUB_STAGE', 2, 'النبأ 1 - الطارق 17', 'mrq_main_1', 1, 59, 78, 1, 86, 17),
  ('mrq_sub_h60', 'prog_maraqi', 'SUB_STAGE', 1, 'الأعلى 1 - الناس 6', 'mrq_main_1', 1, 60, 87, 1, 114, 6)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Track" ("id","programId","nameAr","linesPerDay","ordinal","isActive") VALUES
  ('mrq_trk_1', 'prog_maraqi', '٣ أسطر', 3, 1, true),
  ('mrq_trk_2', 'prog_maraqi', '٥ أسطر', 5, 2, true),
  ('mrq_trk_3', 'prog_maraqi', 'نصف صفحة', 7.5, 3, true),
  ('mrq_trk_4', 'prog_maraqi', 'صفحة', 15, 4, true),
  ('mrq_trk_5', 'prog_maraqi', 'صفحتان', 30, 5, true),
  ('mrq_trk_6', 'prog_maraqi', '٣ صفحات', 45, 6, true),
  ('mrq_trk_7', 'prog_maraqi', '٤ صفحات', 60, 7, true),
  ('mrq_trk_8', 'prog_maraqi', '٥ صفحات', 75, 8, true)
ON CONFLICT ("id") DO NOTHING;

