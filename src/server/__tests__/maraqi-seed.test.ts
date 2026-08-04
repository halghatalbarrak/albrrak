import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// اختبار ثابت (بلا قاعدة): يتحقّق أن بذر مراقي مطابقٌ لملف الأحزاب الموقَّع (§٨٫٢)،
// وأن البنية (تنازليّة، الفاتحة تمهيد، الحزب ١ = البقرة ١–٧٤، ٨ مسارات) كما في DESIGN.
// يمسك أي انحرافٍ قبل Migrate deploy — «لا حدَّ حزبٍ من الذاكرة».

const SQL = readFileSync(
  path.join(process.cwd(), "prisma", "migrations", "11_maraqi_stages_tracks", "migration.sql"),
  "utf8",
);
const FILE = JSON.parse(
  readFileSync(path.join(process.cwd(), "hizb_boundaries.json"), "utf8"),
) as {
  hizb: number;
  juz: number;
  startSurahNum: number;
  startSurah: string;
  startAyah: number;
  endSurahNum: number;
  endSurah: string;
  endAyah: number;
}[];

function hizbBoundaryBlock(): string {
  const start = SQL.indexOf('INSERT INTO "HizbBoundary"');
  const end = SQL.indexOf('ON CONFLICT ("hizb")', start);
  return SQL.slice(start, end);
}

interface HB {
  hizb: number;
  juz: number;
  ssn: number;
  ss: string;
  sa: number;
  esn: number;
  es: string;
  ea: number;
}
function parseHizbBoundaries(): HB[] {
  const re =
    /\((\d+),\s*(\d+),\s*(\d+),\s*'([^']+)',\s*(\d+),\s*(\d+),\s*'([^']+)',\s*(\d+)\)/g;
  const out: HB[] = [];
  let m: RegExpExecArray | null;
  const block = hizbBoundaryBlock();
  while ((m = re.exec(block)) !== null) {
    out.push({
      hizb: +m[1], juz: +m[2], ssn: +m[3], ss: m[4], sa: +m[5],
      esn: +m[6], es: m[7], ea: +m[8],
    });
  }
  return out;
}

interface Sub {
  id: string;
  ordinal: number;
  label: string;
  parent: string;
  hizb: number;
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
}
function parseSubStages(): Sub[] {
  const re =
    /'(mrq_sub_h\d+)',\s*'prog_maraqi',\s*'SUB_STAGE',\s*(\d+),\s*'([^']*)',\s*'(mrq_main_\d+)',\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/g;
  const out: Sub[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(SQL)) !== null) {
    out.push({
      id: m[1], ordinal: +m[2], label: m[3], parent: m[4], hizb: +m[6],
      fromSurah: +m[7], fromAyah: +m[8], toSurah: +m[9], toAyah: +m[10],
    });
  }
  return out;
}

describe("بذر مراقي — ترحيل 11_maraqi_stages_tracks (§٨)", () => {
  it("HizbBoundary: ٦٠ حزبًا مطابقةٌ لملف الأحزاب الموقَّع حرفيًّا", () => {
    const seeded = parseHizbBoundaries().sort((a, b) => a.hizb - b.hizb);
    expect(seeded).toHaveLength(60);
    expect(FILE).toHaveLength(60);
    for (const f of FILE) {
      const s = seeded.find((x) => x.hizb === f.hizb);
      expect(s, `الحزب ${f.hizb} مفقود في البذر`).toBeDefined();
      expect([s!.juz, s!.ssn, s!.ss, s!.sa, s!.esn, s!.es, s!.ea]).toEqual([
        f.juz, f.startSurahNum, f.startSurah, f.startAyah, f.endSurahNum, f.endSurah, f.endAyah,
      ]);
    }
  });

  it("٦٠ مرحلةً فرعيةً بترتيبٍ تنازليّ (ordinal = 61 − hizb)", () => {
    const subs = parseSubStages();
    expect(subs).toHaveLength(60);
    const ordinals = subs.map((s) => s.ordinal).sort((a, b) => a - b);
    expect(ordinals).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    for (const s of subs) expect(s.ordinal).toBe(61 - s.hizb);
    // الحزب ٦٠ (آخر المصحف) ⟵ أول ترتيب.
    expect(subs.find((s) => s.hizb === 60)!.ordinal).toBe(1);
  });

  it("الحزب ١ كمرحلةٍ فرعية = البقرة ١–٧٤ (الفاتحة مقتطعة §٨٫٢)", () => {
    const h1 = parseSubStages().find((s) => s.hizb === 1)!;
    expect(h1.id).toBe("mrq_sub_h1");
    expect(h1.ordinal).toBe(60);
    expect([h1.fromSurah, h1.fromAyah, h1.toSurah, h1.toAyah]).toEqual([2, 1, 2, 74]);
    expect(h1.parent).toBe("mrq_main_6");
    // لكن HizbBoundary يبقى كما في الملف: الفاتحة ← البقرة ٧٤.
    const raw = parseHizbBoundaries().find((h) => h.hizb === 1)!;
    expect([raw.ss, raw.sa]).toEqual(["الفاتحة", 1]);
  });

  it("الفاتحة تمهيدٌ منفصل (CHAPTER، ordinal ٠) خارج الستين", () => {
    expect(SQL).toMatch(/'mrq_prelude_fatiha',\s*'prog_maraqi',\s*'CHAPTER',\s*0/);
  });

  it("٦ مراحل أصلية", () => {
    const mains = SQL.match(/'mrq_main_\d+',\s*'prog_maraqi',\s*'MAIN_STAGE'/g) ?? [];
    expect(mains).toHaveLength(6);
  });

  it("٨ مسارات بأسطرٍ يوميّة من §٨٫٥ (٣..٧٥)", () => {
    const re = /'mrq_trk_\d+',\s*'prog_maraqi',\s*'[^']*',\s*([\d.]+),\s*(\d+),\s*true/g;
    const lines: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(SQL)) !== null) lines.push(Number(m[1]));
    expect(lines.sort((a, b) => a - b)).toEqual([3, 5, 7.5, 15, 30, 45, 60, 75]);
  });

  it("لا تظهر كلمة «حزب» في اسم أيّ مرحلةٍ فرعية (§٨٫٢: الطالب لا يراها)", () => {
    expect(parseSubStages().some((s) => s.label.includes("حزب"))).toBe(false);
  });
});
