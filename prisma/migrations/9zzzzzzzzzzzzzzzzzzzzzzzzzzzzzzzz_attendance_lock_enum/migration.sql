-- قفل الحضور (المهمّة ٩): قيمة ApprovalKind الجديدة في ترحيل enum منفصلٍ يسبق الإعداد.
-- ADD VALUE لا يُستعمَل في المعاملة نفسها، فيُفصَل (كنمط الترحيلات القائم).
ALTER TYPE "ApprovalKind" ADD VALUE IF NOT EXISTS 'ATTENDANCE_UNLOCK';
