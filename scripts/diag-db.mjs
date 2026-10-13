// تشخيص قراءةٍ فقط (مؤقّت): تحقّق وحدات مسارات مراقي (تطابق المصدر + اتّصال بلا فجوة) +
// حدود السور المرجعيّة (آخر آية + صفحة) للمراحل والسلّم. لا كتابة. يُدار عبر Diag DB.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ORDER = [1, ...Array.from({ length: 113 }, (_, i) => 114 - i)];
const idx = new Map(ORDER.map((s, i) => [s, i]));
const nextInOrder = (s) => ORDER[(idx.get(s) ?? -1) + 1] ?? null;

// المتوقَّع من المصدر (maraqi_tracks_v2): كل مسار من الفاتحة حتى سورة حدّه.
const EXPECT = {
  mrq_trk_1: { count: 99, endSurah: 78 },
  mrq_trk_2: { count: 166, endSurah: 58 },
  mrq_trk_3: { count: 218, endSurah: 46 },
  mrq_trk_4: { count: 235, endSurah: 29 },
  mrq_trk_5: { count: 346, endSurah: 2 },
};

try {
  console.log(`\n═══ وحدات المسارات (تطابق + اتّصال) ═══`);
  // آخر آية لكل سورة من بيانات المصحف (MushafLine) — لا من الذاكرة.
  const lines = await prisma.mushafLine.findMany({ select: { endSurah: true, endAyah: true } });
  const lastAyahOf = new Map();
  for (const l of lines) lastAyahOf.set(l.endSurah, Math.max(lastAyahOf.get(l.endSurah) ?? 0, l.endAyah));

  for (const [trackId, exp] of Object.entries(EXPECT)) {
    const units = await prisma.trackUnit.findMany({ where: { trackId }, orderBy: { unitNo: "asc" }, select: { unitNo: true, startSurah: true, startAyah: true, endSurah: true, endAyah: true } });
    const n = units.length;
    const first = units[0], last = units[n - 1];
    // اتّصال: كل وحدةٍ تلي سابقتها مباشرةً (نفس السورة آيةً بعد آية، أو السورة التالية في الترتيب من الآية ١ بعد نهاية السابقة).
    const gaps = [];
    for (let i = 1; i < n; i++) {
      const p = units[i - 1], c = units[i];
      let ok;
      if (c.startSurah === p.endSurah) ok = c.startAyah === p.endAyah + 1;
      else ok = c.startSurah === nextInOrder(p.endSurah) && c.startAyah === 1 && p.endAyah === (lastAyahOf.get(p.endSurah) ?? -1);
      if (!ok) { if (gaps.length < 5) gaps.push(`u${p.unitNo}(${p.endSurah}:${p.endAyah})→u${c.unitNo}(${c.startSurah}:${c.startAyah})`); }
    }
    const firstOk = first && first.startSurah === 1 && first.startAyah === 1;
    const endOk = last && last.endSurah === exp.endSurah && last.endAyah === (lastAyahOf.get(exp.endSurah) ?? -2);
    console.log(`${trackId}: count=${n}${n === exp.count ? "✓" : `✗(متوقَّع ${exp.count})`} | أول=${first?.startSurah}:${first?.startAyah}${firstOk ? "✓" : "✗"} | آخر=${last?.endSurah}:${last?.endAyah}${endOk ? "✓" : `✗(متوقَّع ${exp.endSurah}:${lastAyahOf.get(exp.endSurah)})`} | فجوات=${gaps.length}${gaps.length ? " " + gaps.join(" , ") : ""}`);
  }

  // حدود المراحل الستّ + سورتا السلّم الإضافيّتان — آخر آية + الصفحة، من بيانات المصحف.
  console.log(`\n═══ حدود السور (آخر آية + صفحة) من المصحف ═══`);
  const faces = await prisma.mushafFace.findMany({ select: { page: true, fromSurah: true, fromAyah: true, toSurah: true, toAyah: true } });
  const pageOf = (s, a) => {
    const f = faces.find((f) => (s > f.fromSurah || (s === f.fromSurah && a >= f.fromAyah)) && (s < f.toSurah || (s === f.toSurah && a <= f.toAyah)));
    return f?.page ?? null;
  };
  const NAMES = { 46: "الأحقاف", 29: "العنكبوت", 18: "الكهف", 10: "يونس", 5: "المائدة", 2: "البقرة", 78: "النبأ", 58: "المجادلة" };
  for (const s of [46, 29, 18, 10, 5, 2, 78, 58]) {
    const la = lastAyahOf.get(s);
    console.log(`  سورة ${s} (${NAMES[s]}): آخر آية=${la} · صفحة=${pageOf(s, la)}`);
  }
  console.log(`\n✅ READ-ONLY DIAG OK`);
} catch (e) {
  console.error("❌ QUERY FAILED:", e?.name, e?.code, e?.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
