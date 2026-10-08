-- المدّكر — أدوار البرنامج المُحصَّرة (§٢): نوعُ الدور enum فقط (قبل استعماله في الجدول). مفصولٌ
-- عن «_muddakir_staff_setup» التالي (كنمط ترحيلات المدّكر). لا قيمةَ جديدةٌ في Role العامّ.
CREATE TYPE "MuddakirStaffRole" AS ENUM ('MANAGER', 'ADMIN', 'SUPERVISOR', 'EXAMINER');
