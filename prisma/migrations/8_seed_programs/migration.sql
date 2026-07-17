-- بذرة البرنامجين اليوميّين (§٧، §٨). البرنامج الأسبوعي مؤجَّلٌ بالتصميم — يدخل لاحقًا.
-- البرامج ثابتةٌ بمفاتيحها (ProgramKey)؛ المدير يُنشئ الحلقات تحتها لا البرامج.
-- بيانات فقط، بلا تغيير مخطط. آمنة التكرار.
INSERT INTO "Program" ("id", "key", "nameAr") VALUES
  ('prog_qaidah', 'QAIDAH_MADANIYYAH', 'القاعدة المدنية'),
  ('prog_maraqi', 'MARAQI',            'مراقي')
ON CONFLICT ("key") DO NOTHING;
