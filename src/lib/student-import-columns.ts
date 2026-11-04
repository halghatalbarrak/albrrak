// أعمدة قالب استيراد الطلاب (بيانات نقيّة بلا تبعيّات) — يشاركها الخادم (التحليل) والعميل
// (تنزيل القالب). الترتيب ملزمٌ وهو ترتيب أعمدة ملفّ CSV.

export const IMPORT_COLUMNS = [
  { key: "studentName", ar: "اسم الطالب" },
  { key: "nationalId", ar: "رقم الهوية" },
  { key: "nationality", ar: "الجنسية" },
  { key: "birthDate", ar: "تاريخ الميلاد" },
  { key: "studentGender", ar: "جنس الطالب" },
  { key: "guardianName", ar: "اسم ولي الأمر" },
  { key: "guardianGender", ar: "جنس ولي الأمر" },
  { key: "guardianRelation", ar: "صلة ولي الأمر" },
  { key: "guardianPhone", ar: "جوال ولي الأمر" },
  { key: "studentPhone", ar: "جوال الطالب" },
  { key: "emergencyName", ar: "اسم جهة الطوارئ" },
  { key: "emergencyRelation", ar: "صلة جهة الطوارئ" },
  { key: "emergencyPhone", ar: "جوال الطوارئ" },
  { key: "hifzAmount", ar: "مقدار الحفظ" },
] as const;

export type ColumnKey = (typeof IMPORT_COLUMNS)[number]["key"];
