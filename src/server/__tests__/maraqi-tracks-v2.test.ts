import { readFileSync } from "node:fs";
import path from "node:path";

import { ProgramKey, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { todayTarget } from "../today-target";
import { SURAH_AYAH_COUNTS } from "../quran-ordinal";
import { MARAQI_SURAH_ORDER } from "@/lib/maraqi-order";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createStudent, seedMaraqiTrackForStudent, type SeedUnit } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ═══════════ أ) تتابع وحدات مراجعة المعلّم على عالم الآيات (مراقي ٢) ═══════════
// المصدر prisma/data/maraqi-tracks.json. التحقّق بعدّ آيات السور (SURAH_AYAH_COUNTS، نفس عالم
// آيات MushafLine): لا فجوة ولا تداخل، كلّ حدٍّ آيةٌ حقيقيّة، أوّل وحدةٍ الفاتحة وآخرُها endSurah.

interface FileUnit { seq: number; from: [number, number]; to: [number, number] }
interface FileTrack { key: string; name: string; endSurah: number; units: FileUnit[] }
const DATA = JSON.parse(readFileSync(path.join(process.cwd(), "prisma", "data", "maraqi-tracks.json"), "utf8")) as { tracks: FileTrack[] };

const ORDER_IDX = new Map(MARAQI_SURAH_ORDER.map((s, i) => [s, i]));
const key = (s: number, a: number) => (ORDER_IDX.get(s) ?? 999) * 100_000 + a; // مفتاح ترتيب مراقي
/** الآية التالية بترتيب مراقي (أو null بعد آخر المصحف). */
function successor(surah: number, ayah: number): [number, number] | null {
  if (ayah < SURAH_AYAH_COUNTS[surah]) return [surah, ayah + 1];
  const next = MARAQI_SURAH_ORDER[(ORDER_IDX.get(surah) ?? -1) + 1];
  return next ? [next, 1] : null;
}
const EXPECT: Record<string, { units: number; endSurah: number }> = {
  "3": { units: 99, endSurah: 78 }, "5": { units: 166, endSurah: 58 }, "7.5": { units: 218, endSurah: 46 },
  "15": { units: 235, endSurah: 29 }, "30": { units: 346, endSurah: 2 },
};

describe("وحدات مراقي ٢ — التتابع والأعداد والحدود", () => {
  it("خمسة مسارات بأعدادها المعتمدة (99/166/218/235/346)", () => {
    expect(DATA.tracks.map((t) => t.key).sort()).toEqual(["15", "3", "30", "5", "7.5"]);
    for (const t of DATA.tracks) expect(t.units.length, `عدد وحدات ${t.key}`).toBe(EXPECT[t.key].units);
  });

  for (const t of DATA.tracks) {
    it(`مسار «${t.name}» (${t.key}): يبدأ بالفاتحة، وينتهي بآخر ${EXPECT[t.key].endSurah}، بلا فجوةٍ ولا تداخل`, () => {
      const u = t.units;
      // seq متتابع
      expect(u.map((x) => x.seq)).toEqual(Array.from({ length: u.length }, (_, i) => i + 1));
      // أوّل وحدةٍ الفاتحة ١:١
      expect(u[0].from).toEqual([1, 1]);
      // آخر وحدةٍ تنتهي عند آخر آيةٍ من endSurah
      const endSurah = EXPECT[t.key].endSurah;
      expect(t.endSurah).toBe(endSurah);
      expect(u[u.length - 1].to).toEqual([endSurah, SURAH_AYAH_COUNTS[endSurah]]);
      for (let i = 0; i < u.length; i++) {
        const { from, to } = u[i];
        // حدودٌ حقيقيّة (١ ≤ آية ≤ عدد آيات السورة)، وسورةٌ ضمن ترتيب مراقي
        for (const [s, a] of [from, to]) {
          expect(ORDER_IDX.has(s), `سورة ${s} في الترتيب`).toBe(true);
          expect(a >= 1 && a <= SURAH_AYAH_COUNTS[s], `آية ${s}:${a} حقيقيّة`).toBe(true);
        }
        // داخل الوحدة: from ≤ to (ترتيب مراقي)
        expect(key(from[0], from[1]) <= key(to[0], to[1]), `وحدة ${u[i].seq} from≤to`).toBe(true);
        // التتابع: بداية التالية = خليفةُ نهاية الحاليّة مباشرةً (لا فجوة ولا تداخل)
        if (i + 1 < u.length) {
          expect(successor(to[0], to[1])).toEqual(u[i + 1].from);
        }
      }
    });
  }
});

// ═══════════ ب) الترسيخ والمراجعة والانتقال (وحدويّ، قاعدة) ═══════════

const mkUnits = (n: number): SeedUnit[] =>
  Array.from({ length: n }, (_, i) => ({ unitNo: i + 1, startSurah: 2, startAyah: 5 * i + 1, endSurah: 2, endAyah: 5 * i + 5 }));

/** طالبُ مراقي ملتحقٌ بحلقةٍ، له مسارٌ بوحداته، وموضعٌ مبلوغ (reachedAyah). */
async function maraqiStudent(units: SeedUnit[], reachedUnits: number, policy?: { tarseekhUnits?: number; reviewDaysPerWeek?: number }) {
  const { student } = await createStudent(prisma);
  await seedMaraqiTrackForStudent(prisma, student.id, { units, ...policy });
  const prog = await prisma.program.findUniqueOrThrow({ where: { key: ProgramKey.MARAQI }, select: { id: true } });
  const circle = await createCircle(prisma, prog.id);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  if (reachedUnits > 0) await prisma.maraqiPlacement.create({ data: { studentId: student.id, reachedSurah: 2, reachedAyah: 5 * reachedUnits } });
  return { student, circle };
}

// أيّام الحلقة (مايو ٢٠٢٦): ١٠=الأحد … ١٤=الخميس، ١٥=الجمعة (عطلة).
const WEEK = ["2026-05-10", "2026-05-11", "2026-05-12", "2026-05-13", "2026-05-14"];

describe("المراجعة الأسبوعية تغطّي كلّ الراسخ (مراقي ٢)", () => {
  it("مجموع حصص الأسبوع = كلّ الراسخ، بلا تكرارٍ ولا سقوط؛ والجمعة بلا مراجعة", async () => {
    const { student } = await maraqiStudent(mkUnits(23), 23, { tarseekhUnits: 10, reviewDaysPerWeek: 5 });
    // الراسخ = ٢٣ − ١٠ = ١٣ وحدة (fromAyah: ١، ٦، …، ٦١).
    const seen = new Set<number>();
    let total = 0;
    for (const d of WEEK) {
      const t = await todayTarget(student.id, d, prisma);
      for (const b of t.murajaah?.todaySlice ?? []) { seen.add(b.fromAyah); total += 1; }
    }
    expect(total).toBe(13); // بلا تكرار
    expect(seen.size).toBe(13); // تغطيةٌ كاملة
    expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: 13 }, (_, i) => 5 * i + 1));
    const friday = await todayTarget(student.id, "2026-05-15", prisma);
    expect(friday.murajaah?.todaySlice ?? []).toHaveLength(0);
  });

  it("الترسيخ = `tarseekhUnits` وحدةً سابقة (لكلّ مسار)", async () => {
    const { student } = await maraqiStudent(mkUnits(20), 20, { tarseekhUnits: 4, reviewDaysPerWeek: 5 });
    const t = await todayTarget(student.id, WEEK[0], prisma);
    expect(t.tarseekh).toHaveLength(4); // آخر ٤ وحداتٍ مبلوغة
    expect(t.murajaah?.totalStock).toBe(16); // ٢٠ − ٤
  });

  it("أوّل المسار (محفوظٌ صغير): المراجعة فارغةٌ بلا خطأ", async () => {
    const { student } = await maraqiStudent(mkUnits(10), 3, { tarseekhUnits: 10, reviewDaysPerWeek: 5 });
    const t = await todayTarget(student.id, WEEK[0], prisma);
    expect(t.murajaah?.totalStock).toBe(0);
    expect(t.murajaah?.todaySlice ?? []).toHaveLength(0);
  });
});

describe("إتمام المسار والانتقال (مراقي ٢)", () => {
  it("أتمّ المسار ← COMPLETED، بلا وحدةٍ خارج المسار", async () => {
    const { student } = await maraqiStudent(mkUnits(3), 3);
    const t = await todayTarget(student.id, WEEK[0], prisma);
    expect(t.newHifz).toEqual({ kind: "COMPLETED" });
  });

  it("النقل لمسارٍ أعلى: يبدأ من أوّل وحدةٍ بعد آخر آيةٍ بلغها", async () => {
    // المسار الأعلى بعشرين وحدة، والطالب بلغ خمسًا (آية ٢٥) ⟵ التالي الوحدة ٦ (٢:٢٦–٣٠).
    const { student } = await maraqiStudent(mkUnits(20), 5);
    const t = await todayTarget(student.id, WEEK[0], prisma);
    expect(t.newHifz).toEqual({ kind: "NEW", bound: { fromSurah: 2, fromAyah: 26, toSurah: 2, toAyah: 30 } });
  });
});
