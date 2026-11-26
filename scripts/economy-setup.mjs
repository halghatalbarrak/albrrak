// إعداد بنود الاقتصاد الافتراضيّة (TEACHER + AUTO).
// الاستعمال (عبر workflow فقط):
//   CONFIRM=DRY_RUN  node scripts/economy-setup.mjs   ← قراءة + تقرير (لا كتابة)
//   CONFIRM=APPLY    node scripts/economy-setup.mjs   ← إنشاء البنود الناقصة
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY = process.env.CONFIRM !== "APPLY";
if (DRY) console.log("=== وضع DRY_RUN — قراءةٌ فقط، لا كتابة ===\n");
else console.log("=== وضع APPLY — سيُنشئ البنود الناقصة ===\n");

// ── ١. إحصاء البنود النشطة حسب المصدر ──────────────────────────
const all = await prisma.pointItem.findMany({
  where: { active: true },
  select: { id: true, nameAr: true, value: true, grantSource: true, requiresPresent: true, limitCount: true, limitPeriod: true },
  orderBy: { createdAt: "asc" },
});
const bySource = {};
for (const i of all) bySource[i.grantSource] = (bySource[i.grantSource] ?? 0) + 1;
console.log("── بنود نشطة ──");
for (const [src, cnt] of Object.entries(bySource)) console.log(`  ${src}: ${cnt}`);
if (Object.keys(bySource).length === 0) console.log("  (لا بنود نشطة)");

// ── ٢. معاملات اليوم (UTC) ───────────────────────────────────────
const todayStart = new Date();
todayStart.setUTCHours(0, 0, 0, 0);
const txCount = await prisma.pointTransaction.count({ where: { createdAt: { gte: todayStart } } });
console.log(`\n── معاملات اليوم (UTC): ${txCount} ──\n`);

// ── ٣. البنود المطلوبة (TEACHER) ─────────────────────────────────
const TEACHER_DEFAULTS = [
  { nameAr: "سلوك حسن",    value:  3, requiresPresent: true },
  { nameAr: "الزي",        value:  2, requiresPresent: true },
  { nameAr: "النظافة",     value:  2, requiresPresent: true },
  { nameAr: "المشاركة",    value:  2, requiresPresent: true },
  { nameAr: "مساعدة زميل", value:  2, requiresPresent: true },
  { nameAr: "مخالفة سلوك", value: -3, requiresPresent: true },
];

console.log("── بنود TEACHER ──");
let teacherCreated = 0;
for (const def of TEACHER_DEFAULTS) {
  const existing = all.find((i) => i.grantSource === "TEACHER" && i.nameAr === def.nameAr);
  if (existing) {
    console.log(`  ✅ موجود: ${def.nameAr} (${def.value > 0 ? "+" : ""}${def.value})`);
  } else {
    console.log(`  ❌ ناقص: ${def.nameAr} (${def.value > 0 ? "+" : ""}${def.value})${DRY ? " [لن يُنشأ — DRY_RUN]" : " ← سيُنشأ"}`);
    if (!DRY) {
      await prisma.pointItem.create({
        data: { nameAr: def.nameAr, value: def.value, grantSource: "TEACHER", limitCount: 1, limitPeriod: "DAY", requiresPresent: def.requiresPresent, active: true },
      });
      console.log(`     ✅ أُنشئ.`);
      teacherCreated++;
    }
  }
}

// ── ٤. البنود المطلوبة (AUTO) ────────────────────────────────────
// يستلزم كلٌّ منها: PointItem (grantSource=AUTO) + AutoGrantRule
const AUTO_DEFAULTS = [
  { nameAr: "حضور",        eventType: "ATTENDANCE_PRESENT", value: 2 },
  { nameAr: "إتقان اليوم", eventType: "HIFZ_DONE",          value: 3 },
  { nameAr: "ترسيخ تمّ",   eventType: "TARSEEKH_DONE",       value: 2 },
  { nameAr: "مراجعة تمّت", eventType: "MURAJAAH_DONE",       value: 2 },
];

const existingRules = await prisma.autoGrantRule.findMany({
  where: { active: true },
  select: { eventType: true, pointItemId: true },
});
const boundEvents = new Set(existingRules.map((r) => r.eventType));

console.log("\n── بنود AUTO ──");
let autoCreated = 0;
for (const def of AUTO_DEFAULTS) {
  const hasBinding = boundEvents.has(def.eventType);
  const autoItem = all.find((i) => i.grantSource === "AUTO" && i.nameAr === def.nameAr);
  if (hasBinding && autoItem) {
    console.log(`  ✅ موجود: ${def.nameAr} (${def.eventType})`);
  } else {
    console.log(`  ❌ ناقص: ${def.nameAr} / ${def.eventType}${DRY ? " [لن يُنشأ — DRY_RUN]" : " ← سيُنشأ"}`);
    if (!DRY) {
      if (hasBinding) {
        console.log(`     ⚠️  eventType مربوطٌ ببندٍ آخر — تخطَّى.`);
        continue;
      }
      const item = await prisma.pointItem.create({
        data: { nameAr: def.nameAr, value: def.value, grantSource: "AUTO", limitCount: 1, limitPeriod: "DAY", requiresPresent: true, active: true },
      });
      await prisma.autoGrantRule.create({ data: { pointItemId: item.id, eventType: def.eventType, active: true } });
      console.log(`     ✅ أُنشئ.`);
      autoCreated++;
    }
  }
}

// ── ٥. ملخّص ─────────────────────────────────────────────────────
console.log(`\n── الملخّص ──`);
if (DRY) {
  console.log("وضع DRY_RUN: لم يُنشأ شيء. أعد التشغيل بـCONFIRM=APPLY لإنشاء البنود الناقصة.");
} else {
  console.log(`أُنشئ ${teacherCreated} بنود TEACHER و${autoCreated} بنود AUTO.`);
}

await prisma.$disconnect();
