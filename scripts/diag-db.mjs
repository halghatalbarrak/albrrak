// تشخيص قراءةٍ فقط (مؤقّت على فرع الإصلاح): عدّ صفوف DailySession وتحليل أثر تحويل
// مفتاح اليوم من UTC إلى يوم مكّة. لا كتابة إطلاقاً. يُدار عبر Diag DB (workflow_dispatch).
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
try {
  const u = new URL(url);
  console.log("DATABASE_URL host:port =", `${u.hostname}:${u.port || "(افتراضي)"}`);
  console.log("DATABASE_URL params   =", u.search || "(لا شيء)");
} catch {
  console.log("DATABASE_URL غير قابل للتحليل أو غير مضبوط.");
}

const prisma = new PrismaClient();

// يومٌ مدنيّ (YYYY-MM-DD) بتوقيت مكّة (Asia/Riyadh) للحظةٍ ما — عبر Intl (en-CA = ISO).
const makkahDay = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
// اليوم المدنيّ بتوقيت UTC (كما كان العميل القديم يحسبه عبر toISOString().slice).
const utcDay = (d) => d.toISOString().slice(0, 10);
const addDay = (iso, n) => {
  const t = new Date(`${iso}T00:00:00.000Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

try {
  const total = await prisma.dailySession.count();
  console.log(`\n═══ DailySession ═══`);
  console.log(`إجمالي الصفوف = ${total}`);

  if (total > 0) {
    const sessions = await prisma.dailySession.findMany({ select: { studentId: true, date: true } });
    // مجموعة (studentId|utcCivilDate) الموجودة فعلاً — للكشف عن تصادم القيد الفريد عند الإزاحة +يوم.
    const have = new Set(sessions.map((s) => `${s.studentId}|${utcDay(s.date)}`));

    // أحداث الرصد (الجلسة اليوميّة) — createdAt هو لحظة التسجيل الحقيقيّة (UTC).
    const events = await prisma.event.findMany({
      where: { type: { in: ["HIFZ_RECORDED", "TARSEEKH_RECORDED", "MURAJAAH_RECORDED"] } },
      select: { subjectId: true, createdAt: true, type: true },
    });
    console.log(`أحداث الرصد (HIFZ/TARSEEKH/MURAJAAH_RECORDED) = ${events.length}`);

    // النافذة الحرجة: سُجّل الحدث بين 21:00 و23:59 UTC ⟵ يوم مكّة = اليوم التالي للـUTC.
    const lateWindow = events.filter((e) => {
      const h = e.createdAt.getUTCHours();
      return h >= 21 && h <= 23;
    });
    console.log(`أحداثٌ في النافذة الحرجة (21:00–23:59 UTC) = ${lateWindow.length}`);

    // مرشّحو الإزاحة: (طالب، يومُ UTC للحدث) يطابق صفَّ جلسةٍ مخزّناً بذلك اليوم، ويختلف يومُ مكّة.
    const candidates = new Map(); // studentId|utcDate -> { utcDate, makkah }
    for (const e of lateWindow) {
      const ud = utcDay(e.createdAt);
      const md = makkahDay(e.createdAt);
      if (md === ud) continue; // لا إزاحة
      const key = `${e.subjectId}|${ud}`;
      if (have.has(key)) candidates.set(key, { studentId: e.subjectId, utcDate: ud, makkah: md });
    }
    console.log(`صفوفٌ قد يتغيّر يومها (مرشّحو الإزاحة) = ${candidates.size}`);

    // تصادم القيد الفريد: هل يوجد أصلاً صفٌّ للطالب في اليوم المكّيّ الهدف (utcDate+1)؟
    const collisions = [];
    for (const c of candidates.values()) {
      const target = addDay(c.utcDate, 1);
      if (have.has(`${c.studentId}|${target}`)) collisions.push({ ...c, target });
    }
    console.log(`تصادماتٌ مع القيد الفريد (طالب+يوم) عند الإزاحة = ${collisions.length}`);
    if (collisions.length) {
      console.log("تفاصيل التصادم (studentId مُقنّع جزئيّاً):");
      for (const c of collisions) {
        console.log(`  - student=${c.studentId.slice(0, 6)}… ${c.utcDate} → ${c.target} (موجودٌ مسبقاً)`);
      }
    }
  }
  console.log(`\n✅ READ-ONLY DIAG OK`);
} catch (e) {
  console.error("❌ QUERY FAILED:");
  console.error("  name:   ", e?.name);
  console.error("  code:   ", e?.code);
  console.error("  message:", e?.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
