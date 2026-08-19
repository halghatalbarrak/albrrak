-- الفكرة ١٠: إبطال شهادةٍ لاحقًا (revokedAt). «9zz» يُطبَّق معجميًّا بعد كل الترحيلات.
ALTER TABLE "Certificate" ADD COLUMN "revokedAt" TIMESTAMP(3);
