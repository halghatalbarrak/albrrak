-- التلعيب (ل١): بذر المجموعة الأولى من تعريفات الأوسمة (§٥). idempotent: ON CONFLICT (code) DO NOTHING.
-- المدير يفعّل/يعطّل/يعدّل الاسم والوصف والعتبة لاحقاً؛ البذر لا يطمس تعديلاته (لا تحديث).
INSERT INTO "BadgeDefinition" ("id", "code", "kind", "threshold", "category", "nameAr", "descAr", "emoji", "sortOrder") VALUES
  ('bdef_streak_7',    'STREAK_7',    'STREAK_DAYS',              7,    'REGULARITY',  'سلسلة ٧ أيّام',        'إتمام اليوم سبعة أيّامٍ متتالية.',               '🔥', 10),
  ('bdef_streak_30',   'STREAK_30',   'STREAK_DAYS',              30,   'REGULARITY',  'سلسلة ٣٠ يوماً',       'إتمام اليوم ثلاثين يوماً متتالية.',              '🔥', 11),
  ('bdef_streak_100',  'STREAK_100',  'STREAK_DAYS',              100,  'REGULARITY',  'سلسلة ١٠٠ يوم',        'إتمام اليوم مئة يومٍ متتالية.',                  '🔥', 12),
  ('bdef_streak_365',  'STREAK_365',  'STREAK_DAYS',              365,  'REGULARITY',  'سلسلة ٣٦٥ يوماً',      'إتمام اليوم عاماً كاملاً متتالياً.',            '🔥', 13),
  ('bdef_stage_done',  'STAGE_COMPLETE', 'STAGE_COMPLETE',        NULL, 'ACHIEVEMENT', 'إتمام مرحلة',          'إتمام مرحلةٍ من مراحل البرنامج.',                '🏅', 20),
  ('bdef_track_deg',   'TRACK_DEGREE_COMPLETE', 'TRACK_OR_DEGREE_COMPLETE', NULL, 'ACHIEVEMENT', 'إتمام مسار/درجة', 'إتمام مسارٍ أو درجةٍ كاملة.',            '🏅', 21),
  ('bdef_hifz_khatm',  'HIFZ_KHATM',  'HIFZ_KHATM',               NULL, 'ACHIEVEMENT', 'ختم الحفظ',            'إتمام حفظ القرآن كلّه.',                         '🏅', 22),
  ('bdef_tathbit_cert','TATHBIT_CERT','TATHBIT_CERTIFICATE',      NULL, 'ACHIEVEMENT', 'شهادة التثبيت',        'نيل شهادة تثبيت الحفظ.',                         '🏅', 23),
  ('bdef_week_clean',  'WEEK_NO_ERROR','WEEK_NO_ERROR',           NULL, 'MASTERY',     'أسبوع بلا خطأ',        'أسبوعٌ كاملٌ بلا خطأٍ مسجَّل.',                  '✨', 30),
  ('bdef_recite_clean','STAGE_RECITATION_NO_ERROR','STAGE_RECITATION_NO_ERROR', NULL, 'MASTERY', 'سرد مرحلة بلا خطأ', 'سرد مرحلةٍ كاملةً بلا خطأ.',            '✨', 31),
  ('bdef_faces_10',    'FACES_HEARD_10_NO_ERROR','FACES_HEARD_NO_ERROR', 10, 'MASTERY', '١٠ أوجه مسموعة بلا خطأ', 'تسميع عشرة أوجهٍ متتالية بلا خطأ.',       '✨', 32),
  ('bdef_first_day',   'FIRST_DAY',   'FIRST_DAY',                NULL, 'ONBOARDING',  'أوّل يوم',             'إتمام أوّل يومٍ في البرنامج.',                   '🌱', 40),
  ('bdef_first_week',  'FIRST_WEEK',  'FIRST_WEEK_COMPLETE',      NULL, 'ONBOARDING',  'أوّل أسبوعٍ مكتمل',    'إتمام أوّل أسبوعٍ كاملٍ في البرنامج.',           '🌱', 41)
ON CONFLICT ("code") DO NOTHING;
