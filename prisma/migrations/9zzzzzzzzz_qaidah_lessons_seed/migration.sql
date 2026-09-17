-- تطوير القاعدة المدنية (QAIDAH_RULES.md): بذر دروس الأبواب الـ١٣ (٣٥ درسًا).
-- الاسم «9zzzzzzzzz» (تسعة z) ليُطبَّق بعد «9zzzzzzzz_stage_lesson_qaidah_enums» (فيلزم أن
-- تكون قيمة enum 'LESSON' قد اعتُمدت في معاملةٍ سابقة). **بناءٌ فوق القديم لا استبدال:**
-- الأبواب qm_ch01..13 قائمةٌ بأسمائها وأهدافها ونصوص المؤلف (تطابق QAIDAH_RULES) — نُعيد
-- استعمالها ونضيف الدروس أبناءً عبر parentId. لا نمسّ التمهيد ولا المحطّات (تبقى خاملةً في
-- تدفّق الدروس). idempotent: ON CONFLICT ("id") DO NOTHING.
-- الترتيب المعجميّ للدروس = ordinal عالميّ ١..٣٥ (القيد @@unique([programId, kind, ordinal])).

INSERT INTO "Stage" ("id", "programId", "kind", "ordinal", "nameAr", "parentId") VALUES
  -- الباب ١: الحروف الهجائية
  ('qm_ln01', 'prog_qaidah', 'LESSON',  1, 'الحروف الهجائية',           'qm_ch01'),
  ('qm_ln02', 'prog_qaidah', 'LESSON',  2, 'أشكال الحروف الهجائية',      'qm_ch01'),
  ('qm_ln03', 'prog_qaidah', 'LESSON',  3, 'الهمزة',                    'qm_ch01'),
  -- الباب ٢: الحركات والسكون
  ('qm_ln04', 'prog_qaidah', 'LESSON',  4, 'الفتحة',                    'qm_ch02'),
  ('qm_ln05', 'prog_qaidah', 'LESSON',  5, 'الكسرة',                    'qm_ch02'),
  ('qm_ln06', 'prog_qaidah', 'LESSON',  6, 'الضمّة',                    'qm_ch02'),
  ('qm_ln07', 'prog_qaidah', 'LESSON',  7, 'السكون',                    'qm_ch02'),
  -- الباب ٣: التنوين
  ('qm_ln08', 'prog_qaidah', 'LESSON',  8, 'الفتحتان',                  'qm_ch03'),
  ('qm_ln09', 'prog_qaidah', 'LESSON',  9, 'الكسرتان',                  'qm_ch03'),
  ('qm_ln10', 'prog_qaidah', 'LESSON', 10, 'الضمّتان',                  'qm_ch03'),
  -- الباب ٤: الشدّة مع الحركات
  ('qm_ln11', 'prog_qaidah', 'LESSON', 11, 'الشدّة مع الفتحة',          'qm_ch04'),
  ('qm_ln12', 'prog_qaidah', 'LESSON', 12, 'الشدّة مع الكسرة',          'qm_ch04'),
  ('qm_ln13', 'prog_qaidah', 'LESSON', 13, 'الشدّة مع الضمّة',          'qm_ch04'),
  -- الباب ٥: الشدّة مع التنوين
  ('qm_ln14', 'prog_qaidah', 'LESSON', 14, 'الشدّة مع الفتحتين',        'qm_ch05'),
  ('qm_ln15', 'prog_qaidah', 'LESSON', 15, 'الشدّة مع الكسرتين',        'qm_ch05'),
  ('qm_ln16', 'prog_qaidah', 'LESSON', 16, 'الشدّة مع الضمّتين',        'qm_ch05'),
  ('qm_ln17', 'prog_qaidah', 'LESSON', 17, 'حرفان مشدّدان',             'qm_ch05'),
  -- الباب ٦: الهمزة
  ('qm_ln18', 'prog_qaidah', 'LESSON', 18, 'همزة القطع',               'qm_ch06'),
  ('qm_ln19', 'prog_qaidah', 'LESSON', 19, 'همزة الوصل',               'qm_ch06'),
  -- الباب ٧: المدّ الطبيعيّ
  ('qm_ln20', 'prog_qaidah', 'LESSON', 20, 'المدّ الطبيعيّ',            'qm_ch07'),
  -- الباب ٨: الألف بعد واو الجماعة
  ('qm_ln21', 'prog_qaidah', 'LESSON', 21, 'الألف بعد واو الجماعة',     'qm_ch08'),
  -- الباب ٩: التاء المربوطة
  ('qm_ln22', 'prog_qaidah', 'LESSON', 22, 'التاء المربوطة',           'qm_ch09'),
  -- الباب ١٠: اللام القمرية والشمسية
  ('qm_ln23', 'prog_qaidah', 'LESSON', 23, 'اللام القمرية',            'qm_ch10'),
  ('qm_ln24', 'prog_qaidah', 'LESSON', 24, 'اللام الشمسية',            'qm_ch10'),
  -- الباب ١١: قراءة الكلمات
  ('qm_ln25', 'prog_qaidah', 'LESSON', 25, 'كلمتان',                   'qm_ch11'),
  ('qm_ln26', 'prog_qaidah', 'LESSON', 26, 'ثلاث كلمات',               'qm_ch11'),
  ('qm_ln27', 'prog_qaidah', 'LESSON', 27, 'أربع كلمات',               'qm_ch11'),
  ('qm_ln28', 'prog_qaidah', 'LESSON', 28, 'جملة',                     'qm_ch11'),
  ('qm_ln29', 'prog_qaidah', 'LESSON', 29, 'نصّ',                      'qm_ch11'),
  -- الباب ١٢: مصطلحات رسم المصحف (الدروس الخمسة المُسمّاة في QAIDAH_RULES)
  ('qm_ln30', 'prog_qaidah', 'LESSON', 30, 'رأس حاء صغيرة',            'qm_ch12'),
  ('qm_ln31', 'prog_qaidah', 'LESSON', 31, 'علامة المدّ',              'qm_ch12'),
  ('qm_ln32', 'prog_qaidah', 'LESSON', 32, 'حرف صغير بعد حرف كبير',    'qm_ch12'),
  ('qm_ln33', 'prog_qaidah', 'LESSON', 33, 'ألف/سين صغيرة',            'qm_ch12'),
  ('qm_ln34', 'prog_qaidah', 'LESSON', 34, 'دائرة مكتملة',             'qm_ch12'),
  -- الباب ١٣: الأرقام
  ('qm_ln35', 'prog_qaidah', 'LESSON', 35, 'الأرقام',                  'qm_ch13')
ON CONFLICT ("id") DO NOTHING;
