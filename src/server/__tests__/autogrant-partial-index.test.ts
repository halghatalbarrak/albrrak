import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "../testing/helpers";

afterAll(() => prisma.$disconnect());

// ═══ حارس الفهرس الفريد الجزئيّ (م ج — عكس المنح التلقائيّ) ═══
//
// منع ازدواج المنح التلقائيّ يقوم على فهرسٍ فريدٍ **جزئيّ** يسمح بإعادة المنح بعد العكس:
//   UNIQUE (eventType, sourceRef, studentId) WHERE "reversedAt" IS NULL
// مكتوبٌ يدويًّا بـSQL خام (Prisma لا يعبّر عن الفهارس الجزئيّة). أيّ `prisma migrate dev`
// سيولّد ترحيلاً يُسقطه ويُعيد القيد الفريد المطلق — يكسر إعادة المنح. هذا الاختبار يفشل
// إن غاب الفهرس الجزئيّ أو عاد القيد المطلق، فيمنع مرور ذلك الترحيل.

describe("الفهرس الفريد الجزئيّ لـAutoGrant موجودٌ بعد الترحيلات", () => {
  it("AutoGrant_active_dedup_key فريدٌ وجزئيٌّ (WHERE reversedAt IS NULL)", async () => {
    const rows = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'AutoGrant'`;

    const dedup = rows.find((r) => r.indexname === "AutoGrant_active_dedup_key");
    expect(dedup, "الفهرس الجزئيّ مفقود — رُبّما أسقطه ترحيلٌ مولَّد").toBeDefined();
    expect(dedup!.indexdef).toMatch(/UNIQUE INDEX/i);
    expect(dedup!.indexdef).toMatch(/"reversedAt" IS NULL/i); // الشرط الجزئيّ
  });

  it("القيد الفريد المطلق القديم أُزيل (لا يعود مع migrate dev)", async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'AutoGrant'`;
    const names = rows.map((r) => r.indexname);
    expect(names).not.toContain("AutoGrant_eventType_sourceRef_studentId_key");
  });
});
