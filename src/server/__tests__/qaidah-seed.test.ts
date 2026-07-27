import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// اختبار ثابت (بلا قاعدة) يتحقّق من صحّة ترحيل بذر القاعدة المدنية (§٧).
// يقرأ SQL ويؤكّد الأوزان والتغطية — يمسك أخطاء البذر قبل Migrate deploy.

const SQL = readFileSync(
  path.join(process.cwd(), "prisma", "migrations", "9_seed_qaidah_stages", "migration.sql"),
  "utf8",
);

const EXPECTED_WEIGHTS = [8, 14, 8, 8, 10, 4, 4, 4, 4, 4, 8, 8, 3];

interface Ch {
  id: string;
  ordinal: number;
  nameAr: string;
  weight: number;
}

function parseChapters(): Ch[] {
  const re = /'(qm_\w+)',\s*'prog_qaidah',\s*'CHAPTER',\s*(\d+),\s*'([^']+)',\s*(\d+)/g;
  const out: Ch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(SQL)) !== null) {
    out.push({ id: m[1], ordinal: Number(m[2]), nameAr: m[3], weight: Number(m[4]) });
  }
  return out;
}

function parseMilestones(): { ordinal: number; nameAr: string; meta: Record<string, unknown> }[] {
  const re =
    /'(qm_\w+)',\s*'prog_qaidah',\s*'MILESTONE',\s*(\d+),\s*'([^']+)',\s*'(\{[^']+\})'::jsonb/g;
  const out: { ordinal: number; nameAr: string; meta: Record<string, unknown> }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(SQL)) !== null) {
    out.push({ ordinal: Number(m[2]), nameAr: m[3], meta: JSON.parse(m[4]) as Record<string, unknown> });
  }
  return out;
}

describe("بذر القاعدة المدنية — ترحيل 9_seed_qaidah_stages", () => {
  const chapters = parseChapters();

  it("١٣ بابًا (ب١..ب١٣) + التمهيد (ب٠)", () => {
    const ordinals = chapters.map((c) => c.ordinal).sort((a, b) => a - b);
    expect(ordinals).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it("الأوزان = عدد الصفحات، والإجمالي ٨٧ (بلا التمهيد)", () => {
    const graded = chapters.filter((c) => c.ordinal >= 1).sort((a, b) => a.ordinal - b.ordinal);
    expect(graded.map((c) => c.weight)).toEqual(EXPECTED_WEIGHTS);
    expect(graded.reduce((s, c) => s + c.weight, 0)).toBe(87);
  });

  it("التمهيد: ب٠ ووزنه ٠ (خارج التقدّم بالوزن)", () => {
    const prelude = chapters.find((c) => c.ordinal === 0);
    expect(prelude?.nameAr).toContain("تمهيد");
    expect(prelude?.weight).toBe(0);
  });

  it("لا يُستعمل مصطلح «الفاتحة» اسمًا لأيّ مرحلة (خاص بمراقي)", () => {
    const names = [...chapters.map((c) => c.nameAr), ...parseMilestones().map((m) => m.nameAr)];
    expect(names.some((n) => n.includes("الفاتحة"))).toBe(false);
  });

  it("٤ محطات + التخرج، تغطّي الأبواب ١..١٣ مرّةً واحدة بلا تداخل", () => {
    const ms = parseMilestones().sort((a, b) => a.ordinal - b.ordinal);
    expect(ms).toHaveLength(5);
    expect(ms[4].nameAr).toBe("التخرج");
    const covered = ms
      .flatMap((m) => (Array.isArray(m.meta.chapters) ? (m.meta.chapters as number[]) : []))
      .sort((a, b) => a - b);
    expect(covered).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
});
