-- بذرة جنسيات — بداية قابلة للتعديل (المدير يزيد/يعدّل). يحتاجها نموذج القيد.
INSERT INTO "Nationality" ("id", "nameAr", "isActive", "ordinal") VALUES
  ('nat_saudi',    'سعودي',     true, 1),
  ('nat_nonsaudi', 'غير سعودي', true, 2)
ON CONFLICT ("nameAr") DO NOTHING;
