-- ترحيل enum: إضافة MANUAL_GRANT لـAutoEventType
-- (المنح اليدويّ من الشاشة الموحّدة — مُعرِّف فريد في دفتر AutoGrant)
ALTER TYPE "AutoEventType" ADD VALUE IF NOT EXISTS 'MANUAL_GRANT';
