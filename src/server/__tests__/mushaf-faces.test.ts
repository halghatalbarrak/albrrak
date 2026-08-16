import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// تحقّقٌ نقيّ (بلا قاعدة) لخريطة أوجه مصحف المدينة (الحكم ٧، المرحلة ١). مصدر الحقيقة:
// mushaf_faces.json (من QUL). يُثبِّت: ٦٠٤ صفحة بلا فجوة/تكرار، تتابع ١:١←١١٤:٦، تغطية
// كل حزبٍ بأوجهٍ متّصلة، وتطابق ترحيل ١٩ (طبعة ١٤٤١) مع الملفّ (لا انحراف بين البذر والمصدر).

const ROOT = process.cwd();
interface Face { page: number; fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }
const faces: Face[] = JSON.parse(readFileSync(path.join(ROOT, "mushaf_faces.json"), "utf8"));

// عدد آيات السور (عدّ الكوفة، ٦٢٣٦) — للترتيب العالميّ (كـquran-ordinal).
const CNT = [0, 7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6];
const CUM = [0, 0];
for (let s = 1; s <= 114; s++) CUM[s + 1] = CUM[s] + CNT[s];
const ord = (s: number, a: number) => CUM[s] + a;

describe("خريطة أوجه مصحف المدينة (الحكم ٧، المرحلة ١)", () => {
  it("٦٠٤ صفحة بترقيمٍ متّصلٍ بلا فجوة ولا تكرار", () => {
    expect(faces).toHaveLength(604);
    const sorted = [...faces].sort((a, b) => a.page - b.page);
    sorted.forEach((f, i) => expect(f.page).toBe(i + 1));
  });

  it("تتابعٌ متّصلٌ من ١:١ إلى ١١٤:٦ (بلا فجوة ولا تداخل)", () => {
    const sorted = [...faces].sort((a, b) => a.page - b.page);
    expect(ord(sorted[0].fromSurah, sorted[0].fromAyah)).toBe(1); // ١:١
    expect(ord(sorted[603].toSurah, sorted[603].toAyah)).toBe(6236); // ١١٤:٦
    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i];
      expect(ord(f.toSurah, f.toAyah)).toBeGreaterThanOrEqual(ord(f.fromSurah, f.fromAyah));
      if (i > 0) {
        const p = sorted[i - 1];
        expect(ord(f.fromSurah, f.fromAyah)).toBe(ord(p.toSurah, p.toAyah) + 1);
      }
    }
  });

  it("كل حزبٍ في HizbBoundary تغطّيه أوجهٌ متّصلة", () => {
    const hb: { hizb: number; startSurahNum: number; startAyah: number; endSurahNum: number; endAyah: number }[] =
      JSON.parse(readFileSync(path.join(ROOT, "hizb_boundaries.json"), "utf8"));
    for (const b of hb) {
      const hs = ord(b.startSurahNum, b.startAyah);
      const he = ord(b.endSurahNum, b.endAyah);
      const ov = faces
        .filter((f) => ord(f.fromSurah, f.fromAyah) <= he && ord(f.toSurah, f.toAyah) >= hs)
        .sort((a, b2) => a.page - b2.page);
      expect(ov.length).toBeGreaterThan(0);
      let cursor = hs;
      for (const f of ov) {
        const a = ord(f.fromSurah, f.fromAyah);
        const z = ord(f.toSurah, f.toAyah);
        expect(a).toBeLessThanOrEqual(cursor); // بلا فجوة
        if (z + 1 > cursor) cursor = z + 1;
      }
      expect(cursor).toBeGreaterThan(he); // غطّى نهاية الحزب
    }
  });

  it("ترحيل ١٩ (طبعة ١٤٤١) يطابق mushaf_faces.json (لا انحراف بين البذر والمصدر)", () => {
    // ترحيل ١٩ أعاد بناء MushafFace من بيانات quran-svg (المصدر النهائيّ للحقيقة).
    const sql = readFileSync(path.join(ROOT, "prisma/migrations/19_mushaf_faces_1441/migration.sql"), "utf8");
    const rows = [...sql.matchAll(/\((\d+),(\d+),(\d+),(\d+),(\d+)\)/g)].map((m) => ({
      page: +m[1], fromSurah: +m[2], fromAyah: +m[3], toSurah: +m[4], toAyah: +m[5],
    }));
    expect(rows).toHaveLength(604);
    const byPage = new Map(faces.map((f) => [f.page, f]));
    for (const r of rows) {
      expect(byPage.get(r.page)).toEqual(r);
    }
  });
});
