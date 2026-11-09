-- إضافة «العشاء» إلى أوقات الحلقة. ترحيلٌ إضافيّ بلا حذف — آمنٌ عند التكرار.
ALTER TYPE "TimeSlot" ADD VALUE IF NOT EXISTS 'ISHA';
