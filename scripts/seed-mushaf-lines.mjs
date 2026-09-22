// بذر خريطة السطر↔الآية (البند ٢) من مضلّعات مصحف المدينة على Supabase.
// الاستعمال:
//   node scripts/seed-mushaf-lines.mjs                 → بذرٌ كامل (٦٠٤ صفحة) إلى القاعدة (idempotent)
//   node scripts/seed-mushaf-lines.mjs --sample 1,2,300 → استنباطٌ وطباعةٌ فقط (بلا قاعدة) — للمراجعة
//
// الاستنباط: كل مقطع SVG (M…Z) = سطر؛ نأخذ مركز y للمقطع ونسنده لسطرٍ على شبكة ١٥ سطراً
// (viewBox ٥٥٠). الصفحتان ١ و٢ («صناديق» مزخرفة) مُعالَجتان يدويًّا. البذر لا يمسّ الترحيل.

const BASE = process.env.MUSHAF_ASSETS_BASE ?? "https://rsrsngtjbeschsslpklh.supabase.co/storage/v1/object/public/mushaf";
const LINES = 15; // مصحف المدينة: ١٥ سطراً لكل وجهٍ ممتلئ (viewBox المضلّعات ٥٥٠)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── معالجةٌ خاصّة للصفحتين المزخرفتين (صيغة صناديق، لا تنطبق شبكة ١٥) ──
const SPECIAL = {
  1: [ // الفاتحة: ٧ آيات على ٦ أسطر (١:٣ و١:٤ يتشاركان السطر ٣)
    { page: 1, lineNo: 1, startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 1 },
    { page: 1, lineNo: 2, startSurah: 1, startAyah: 2, endSurah: 1, endAyah: 2 },
    { page: 1, lineNo: 3, startSurah: 1, startAyah: 3, endSurah: 1, endAyah: 4 },
    { page: 1, lineNo: 4, startSurah: 1, startAyah: 5, endSurah: 1, endAyah: 5 },
    { page: 1, lineNo: 5, startSurah: 1, startAyah: 6, endSurah: 1, endAyah: 6 },
    { page: 1, lineNo: 6, startSurah: 1, startAyah: 7, endSurah: 1, endAyah: 7 },
  ],
  2: [ // أوّل البقرة: الآيات ١..٥، آيةٌ لكل سطر
    { page: 2, lineNo: 1, startSurah: 2, startAyah: 1, endSurah: 2, endAyah: 1 },
    { page: 2, lineNo: 2, startSurah: 2, startAyah: 2, endSurah: 2, endAyah: 2 },
    { page: 2, lineNo: 3, startSurah: 2, startAyah: 3, endSurah: 2, endAyah: 3 },
    { page: 2, lineNo: 4, startSurah: 2, startAyah: 4, endSurah: 2, endAyah: 4 },
    { page: 2, lineNo: 5, startSurah: 2, startAyah: 5, endSurah: 2, endAyah: 5 },
  ],
};

/** نطاقات y (ymin,ymax) لكل مقطعٍ من المضلّع (SVG متعدّد المقاطع، أو صندوقٌ واحد). */
function bandsOf(poly) {
  if (poly.includes("M") || poly.includes("L")) {
    const bands = [];
    for (const seg of poly.split(/[Zz]/)) {
      const nums = seg.match(/-?\d+\.?\d*/g);
      if (!nums) continue;
      const ys = nums.filter((_, i) => i % 2 === 1).map(Number);
      if (ys.length) bands.push([Math.min(...ys), Math.max(...ys)]);
    }
    return bands;
  }
  const ys = poly.split(/\s+/).filter(Boolean).map((p) => Number(p.split(",")[1])).filter((n) => !Number.isNaN(n));
  return ys.length ? [[Math.min(...ys), Math.max(...ys)]] : [];
}

// مراكز الأسطر الخمسة عشر معايَرةً (السطر ١ مركزه ~٢٤، الخطوة ~٣٦٫١) — مطابقةً لمصحف
// المدينة. نُسند المقطع لكل سطرٍ يقع مركزه داخل نطاقه العموديّ: المقطع القصير يحوي مركزاً
// واحداً (سطرٌ واحد)، والطويل (آيةٌ تمتدّ أسطراً) يحوي عدّة مراكز (أسطره كلّها). هذا يتفادى
// انحراف الشبكة من الصفر (تسرّب صندوقٍ متطرّفٍ إلى سطرين).
const LINE1_CENTER = 24.0;
const LINE_STEP = 36.07;
const CENTERS = Array.from({ length: LINES }, (_, i) => LINE1_CENTER + i * LINE_STEP);

function linesOfBand(ymin, ymax) {
  const out = [];
  for (let k = 0; k < LINES; k++) if (CENTERS[k] >= ymin - 2 && CENTERS[k] <= ymax + 2) out.push(k + 1);
  if (out.length === 0) { // نطاقٌ بين مركزين — أسنده لأقربها
    const mid = (ymin + ymax) / 2;
    let best = 0;
    for (let k = 1; k < LINES; k++) if (Math.abs(CENTERS[k] - mid) < Math.abs(CENTERS[best] - mid)) best = k;
    out.push(best + 1);
  }
  return out;
}

/** يستنبط صفوف MushafLine لصفحةٍ: لكل آيةٍ أسطرها (من نطاقات مقاطعها على الشبكة)، ثم لكل
 * سطرٍ حدودُ آياته. الأسطر الفارغة (ترويسة سورة) لا صفَّ لها. (أو الجدول الخاصّ ١، ٢.) */
function deriveLines(page, polys) {
  if (SPECIAL[page]) return SPECIAL[page];
  const byLine = new Map(); // lineNo → {min,max} بمفتاح surah*1000+ayah
  for (const a of polys) {
    const key = a.surahNumber * 1000 + a.ayahNumber;
    const lset = new Set();
    for (const [lo, hi] of bandsOf(a.polygon)) for (const l of linesOfBand(lo, hi)) lset.add(l);
    for (const ln of lset) {
      const e = byLine.get(ln) ?? { min: null, max: null };
      if (!e.min || key < e.min.key) e.min = { key, s: a.surahNumber, a: a.ayahNumber };
      if (!e.max || key > e.max.key) e.max = { key, s: a.surahNumber, a: a.ayahNumber };
      byLine.set(ln, e);
    }
  }
  return [...byLine.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([lineNo, e]) => ({ page, lineNo, startSurah: e.min.s, startAyah: e.min.a, endSurah: e.max.s, endAyah: e.max.a }));
}

async function fetchPage(page, tries = 6) {
  const n = String(page).padStart(3, "0");
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/${n}.json`);
      if (r.status === 429) { await sleep(400 * (i + 1)); continue; } // تهدئةٌ للحدّ المعدّل
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(400 * (i + 1));
    }
  }
  throw new Error(`تعذّر جلب الصفحة ${page} بعد ${tries} محاولات.`);
}

function printTable(page, rows) {
  console.log(`\n===== صفحة ${page} — ${rows.length} سطراً =====`);
  console.log("سطر | البداية | النهاية");
  for (const r of rows) {
    console.log(`${String(r.lineNo).padStart(2)} | ${r.startSurah}:${r.startAyah}`.padEnd(18) + ` | ${r.endSurah}:${r.endAyah}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--sample") {
    const pages = (args[1] ?? "").split(",").map(Number).filter(Boolean);
    for (const p of pages) printTable(p, deriveLines(p, await fetchPage(p)));
    return;
  }

  // بذرٌ كامل: يحتاج قاعدةً (DIRECT_URL يُفضَّل للكتابة المجمّعة).
  const { PrismaClient } = await import("@prisma/client");
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  let inserted = 0;
  try {
    for (let page = 1; page <= 604; page++) {
      const rows = deriveLines(page, await fetchPage(page));
      const res = await prisma.mushafLine.createMany({ data: rows, skipDuplicates: true }); // idempotent
      inserted += res.count;
      if (page % 50 === 0) console.log(`… صفحة ${page} · مُدرَجٌ حتى الآن ${inserted}`);
      await sleep(60); // لطفٌ بالحدّ المعدّل
    }
    console.log(`تمّ. أُدرِج ${inserted} سطراً (المكرّر مُتجاوَز).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
