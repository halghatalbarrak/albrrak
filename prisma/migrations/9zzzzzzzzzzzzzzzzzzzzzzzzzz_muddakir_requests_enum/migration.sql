-- المدّكر — طلبات الإداريّ (§٢): نوعا التعداد فقط (قبل الجدول). مفصولٌ عن «_requests_setup».
CREATE TYPE "MuddakirRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "MuddakirRequestType" AS ENUM ('ENROLL', 'ASSIGN_SUPERVISOR', 'SET_MODE', 'SET_SETTING', 'SET_TATHBIT_LADDER', 'SET_POINT_ITEM');
