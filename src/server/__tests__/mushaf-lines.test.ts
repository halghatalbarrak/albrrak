import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ayahsInLineRange, linesForPage, unitBoundsByLines } from "../mushaf-lines";
import { ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ─────────── تركيبات معروفة (مستنبَطة وطابقها محمد بصريًّا) ───────────

// صفحة ٣٠٠ — الكهف ٥٤–٦١، ١٥ سطراً متّصلة (مرجع التحقّق).
const PAGE_300 = [
  [1, 18, 54, 18, 54], [2, 18, 54, 18, 55], [3, 18, 55, 18, 55], [4, 18, 55, 18, 56],
  [5, 18, 56, 18, 56], [6, 18, 56, 18, 56], [7, 18, 57, 18, 57], [8, 18, 57, 18, 57],
  [9, 18, 57, 18, 57], [10, 18, 57, 18, 58], [11, 18, 58, 18, 58], [12, 18, 58, 18, 59],
  [13, 18, 59, 18, 60], [14, 18, 60, 18, 61], [15, 18, 61, 18, 61],
];

// صفحة ١ — الفاتحة (معالجةٌ خاصّة): ٧ آيات على ٦ أسطر.
const PAGE_1 = [
  [1, 1, 1, 1, 1], [2, 1, 2, 1, 2], [3, 1, 3, 1, 4], [4, 1, 5, 1, 5], [5, 1, 6, 1, 6], [6, 1, 7, 1, 7],
];

// صفحة ٦٠٤ — الناس (١١٤) على الأسطر ١٢..١٥ (لاختبار حدّ السورة).
const PAGE_604_NAS = [
  [12, 114, 1, 114, 3], [13, 114, 3, 114, 5], [14, 114, 5, 114, 5], [15, 114, 6, 114, 6],
];

async function seed(page: number, rows: number[][]) {
  await prisma.mushafLine.createMany({
    data: rows.map(([lineNo, ss, sa, es, ea]) => ({ page, lineNo, startSurah: ss, startAyah: sa, endSurah: es, endAyah: ea })),
  });
}

// ═══════════════ linesForPage ═══════════════

describe("linesForPage — أسطر الصفحة بحدودها", () => {
  it("الفاتحة: ٦ أسطر مرتّبة (١:١ … ١:٧)", async () => {
    await seed(1, PAGE_1);
    const lines = await linesForPage(1);
    expect(lines.map((l) => l.lineNo)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(lines[2]).toMatchObject({ lineNo: 3, startSurah: 1, startAyah: 3, endSurah: 1, endAyah: 4 });
  });

  it("صفحة ٣٠٠: ١٥ سطراً متّصلة بلا فجوة", async () => {
    await seed(300, PAGE_300);
    const lines = await linesForPage(300);
    expect(lines.map((l) => l.lineNo)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    // تتابعٌ متّصل بلا تخطّي آية: بداية كل سطرٍ ≤ نهاية سابقه + ١ (كلّها في السورة ١٨).
    for (let i = 1; i < lines.length; i++) {
      const prevEnd = lines[i - 1].endSurah * 1000 + lines[i - 1].endAyah;
      const curStart = lines[i].startSurah * 1000 + lines[i].startAyah;
      expect(curStart).toBeLessThanOrEqual(prevEnd + 1);
    }
  });
});

// ═══════════════ ayahsInLineRange ═══════════════

describe("ayahsInLineRange — آيات نطاق أسطر", () => {
  it("صفحة ٣٠٠ الأسطر ١..٣ ← الكهف ٥٤..٥٥", async () => {
    await seed(300, PAGE_300);
    const r = await ayahsInLineRange(300, 1, 3);
    expect(r).toMatchObject({ fromSurah: 18, fromAyah: 54, toSurah: 18, toAyah: 55 });
    expect(r.ayahs).toEqual([{ surah: 18, ayah: 54 }, { surah: 18, ayah: 55 }]);
  });

  it("نطاقٌ بلا أسطرٍ مبذورة ← يُرفض", async () => {
    await expect(ayahsInLineRange(300, 1, 3)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ═══════════════ unitBoundsByLines (أساس الوحدة) ═══════════════

describe("unitBoundsByLines — وحدةٌ بحدود آيات (الحكم ٩ + وجهة اليوم)", () => {
  it("٣ أسطر من ١٨:٥٤ ← ١٨:٥٤ إلى ١٨:٥٥", async () => {
    await seed(300, PAGE_300);
    const u = await unitBoundsByLines({ surah: 18, ayah: 54 }, 3);
    expect(u).toEqual({ fromSurah: 18, fromAyah: 54, toSurah: 18, toAyah: 55 });
  });

  it("الآية لا تُكسَر: سطران من ١٨:٥٤ يُنهيان بآيةٍ كاملة (١٨:٥٥ وإن امتدّت)", async () => {
    await seed(300, PAGE_300);
    const u = await unitBoundsByLines({ surah: 18, ayah: 54 }, 2);
    // السطر ٢ ينتهي عند ١٨:٥٥؛ تُعاد ٥٥ كاملةً وإن امتدّت لأسطرٍ تالية.
    expect(u.toSurah).toBe(18);
    expect(u.toAyah).toBe(55);
  });

  it("سطرٌ واحد من ١٨:٥٤ ← ١٨:٥٤ وحدها", async () => {
    await seed(300, PAGE_300);
    expect(await unitBoundsByLines({ surah: 18, ayah: 54 }, 1)).toEqual({ fromSurah: 18, fromAyah: 54, toSurah: 18, toAyah: 54 });
  });

  it("حدّ السورة: عددٌ يتجاوز أسطر السورة ← يقف عند آخر آية (الناس ١..٦)", async () => {
    await seed(604, PAGE_604_NAS);
    const u = await unitBoundsByLines({ surah: 114, ayah: 1 }, 99);
    expect(u).toEqual({ fromSurah: 114, fromAyah: 1, toSurah: 114, toAyah: 6 });
  });

  it("عددٌ غير صالح ← يُرفض", async () => {
    await seed(300, PAGE_300);
    await expect(unitBoundsByLines({ surah: 18, ayah: 54 }, 0)).rejects.toBeInstanceOf(ValidationError);
  });

  it("سورةٌ بلا خريطة ← يُرفض", async () => {
    await expect(unitBoundsByLines({ surah: 2, ayah: 1 }, 3)).rejects.toBeInstanceOf(ValidationError);
  });
});
