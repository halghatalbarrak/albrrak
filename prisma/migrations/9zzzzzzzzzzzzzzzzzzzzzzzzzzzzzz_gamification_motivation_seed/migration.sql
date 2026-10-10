-- التلعيب (ل٦): بذر قوالب التحفيز الافتراضيّة (§٦). idempotent: ON CONFLICT (kind) DO NOTHING.
-- المدير يعدّل النصّ لاحقاً؛ البذر لا يطمس تعديله.
INSERT INTO "MotivationTemplate" ("id", "kind", "textAr", "active", "updatedAt") VALUES
  ('mt_streak_risk', 'STREAK_AT_RISK',   'سلسلتك {days} — أتمّ اليوم لئلّا تنقطع 🔥', true, CURRENT_TIMESTAMP),
  ('mt_first_step',  'FIRST_STEP',       'أتمّ يومك الأوّل لتبدأ سلسلتك 🌱',          true, CURRENT_TIMESTAMP),
  ('mt_badge_near',  'BADGE_NEAR',       'بقي {remaining} لوسام «{badge}» 🏅',         true, CURRENT_TIMESTAMP),
  ('mt_station',     'STATION_PROGRESS', 'أنجزتَ {done} من {total} في {station} — واصِل ✨', true, CURRENT_TIMESTAMP)
ON CONFLICT ("kind") DO NOTHING;
