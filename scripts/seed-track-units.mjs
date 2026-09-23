// بذر وحدات المسارات المُجهَّزة (البند ٢، المرحلة ٣) — يولّد لكل مسارٍ وحداته من خريطة السطر
// ↔الآية (MushafLine) ويخزّنها في TrackUnit. idempotent (skipDuplicates على trackId+unitNo).
// الاستعمال:
//   node scripts/seed-track-units.mjs                 → بذرٌ كامل إلى القاعدة
//   node scripts/seed-track-units.mjs --sample <trackNameSubstr> <n> → أول n وحدة لمسارٍ (بلا كتابة)
import { PrismaClient } from "@prisma/client";
import { generateTrackUnits } from "./track-units-gen.mjs";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

async function loadLines() {
  const rows = await prisma.mushafLine.findMany({
    select: { page: true, lineNo: true, startSurah: true, startAyah: true, endSurah: true, endAyah: true },
  });
  if (rows.length === 0) throw new Error("خريطة السطر↔الآية (MushafLine) فارغة — ابذرها أولاً.");
  return rows;
}

async function tracks() {
  const program = await prisma.program.findUnique({ where: { key: "MARAQI" }, select: { id: true } });
  if (!program) throw new Error("برنامج مراقي غير موجود.");
  return prisma.track.findMany({ where: { programId: program.id }, select: { id: true, nameAr: true, linesPerDay: true, ordinal: true }, orderBy: { ordinal: "asc" } });
}

async function main() {
  const args = process.argv.slice(2);
  const lines = await loadLines();
  const list = await tracks();

  if (args[0] === "--sample") {
    const sub = args[1] ?? "";
    const n = Number(args[2] ?? 5);
    const t = list.find((x) => x.nameAr.includes(sub));
    if (!t) { console.log("لا مسار يطابق:", sub, "| المتاح:", list.map((x) => x.nameAr).join(" · ")); return; }
    const units = generateTrackUnits(lines, t.linesPerDay);
    console.log(`\n=== مسار «${t.nameAr}» (${t.linesPerDay} سطر/يوم) — ${units.length} وحدة · أول ${n} ===`);
    for (const u of units.slice(0, n)) console.log(`  وحدة ${u.unitNo}: ${u.startSurah}:${u.startAyah} → ${u.endSurah}:${u.endAyah}`);
    await prisma.$disconnect();
    return;
  }

  let total = 0;
  try {
    for (const t of list) {
      const units = generateTrackUnits(lines, t.linesPerDay);
      const data = units.map((u) => ({ trackId: t.id, unitNo: u.unitNo, startSurah: u.startSurah, startAyah: u.startAyah, endSurah: u.endSurah, endAyah: u.endAyah }));
      const res = await prisma.trackUnit.createMany({ data, skipDuplicates: true });
      total += res.count;
      console.log(`مسار «${t.nameAr}» (${t.linesPerDay}): ${units.length} وحدة · أُدرِج ${res.count}`);
    }
    console.log(`تمّ. أُدرِج ${total} وحدةً إجمالاً (المكرّر مُتجاوَز).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
