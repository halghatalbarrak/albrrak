-- الحكم ٧ (المرحلة ٨): التخرّج — قيمتا enum جديدتان (إضافةٌ آمنة، لا تُستعمل داخل الترحيل).
ALTER TYPE "ApprovalKind" ADD VALUE 'GRADUATION';
ALTER TYPE "StudentState" ADD VALUE 'GRADUATED';
