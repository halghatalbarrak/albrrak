// تشخيص قراءةٍ فقط (مؤقّت على فرع الإصلاح): عدّ صفوف Attendance وتحليل أثر تحويل مفتاح
// اليوم من UTC إلى يوم مكّة. لا كتابة إطلاقاً. يُدار عبر Diag DB (workflow_dispatch).
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
try {
  const u = new URL(url);
  console.log("DATABASE_URL host:port =", `${u.hostname}:${u.port || "(افتراضي)"}`);
} catch {
  console.log("DATABASE_URL غير قابل للتحليل أو غير مضبوط.");
}

const prisma = new PrismaClient();

// يومٌ مدنيّ (YYYY-MM-DD) بتوقيت مكّة لِلحظة، وبتوقيت UTC (كما كان العميل القديم يحسبه).
const makkahDay = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const utcDay = (d) => d.toISOString().slice(0, 10);

try {
  const total = await prisma.attendance.count();
  console.log(`\n═══ Attendance ═══`);
  console.log(`إجمالي الصفوف = ${total}`);

  if (total > 0) {
    const rows = await prisma.attendance.findMany({ select: { studentId: true, circleId: true, date: true } });
    const have = new Set(rows.map((r) => `${r.studentId}|${utcDay(r.date)}`));

    // أحداث الرصد الجماعيّ — createdAt لحظة التسجيل الحقيقيّة، payload.date اليوم المخزَّن (UTC).
    const events = await prisma.event.findMany({
      where: { type: "ATTENDANCE_RECORDED" },
      select: { subjectId: true, createdAt: true, payload: true },
    });
    console.log(`أحداث ATTENDANCE_RECORDED = ${events.length}`);

    const late = events.filter((e) => { const h = e.createdAt.getUTCHours(); return h >= 21 && h <= 23; });
    console.log(`منها في النافذة الحرجة (21:00–23:59 UTC) = ${late.length}`);

    // إزاحاتٌ فريدة (حلقة، يومٌ مخزَّن → يوم مكّة) حيث يختلف اليومان.
    const shifts = new Map(); // circleId|fromISO -> {circleId, fromISO, toISO}
    for (const e of late) {
      const pd = e.payload && typeof e.payload === "object" ? e.payload.date : undefined;
      if (typeof pd !== "string") continue;
      const md = makkahDay(e.createdAt);
      if (md !== pd) shifts.set(`${e.subjectId}|${pd}`, { circleId: e.subjectId, fromISO: pd, toISO: md });
    }
    console.log(`حلقات×أيّام تحتاج إزاحة = ${shifts.size}`);

    // صفوف Attendance المتأثرة + تصادم القيد الفريد (طالب+يوم) عند الإزاحة.
    let affected = 0;
    const collisions = [];
    for (const s of shifts.values()) {
      const rs = rows.filter((r) => r.circleId === s.circleId && utcDay(r.date) === s.fromISO);
      for (const r of rs) {
        affected++;
        if (have.has(`${r.studentId}|${s.toISO}`)) collisions.push({ studentId: r.studentId, from: s.fromISO, to: s.toISO });
      }
    }
    console.log(`صفوفٌ يتغيّر يومها (متأثرة) = ${affected}`);
    console.log(`تصادماتٌ مع @@unique([studentId,date]) = ${collisions.length}`);
    for (const c of collisions) console.log(`  - student=${c.studentId.slice(0, 6)}… ${c.from} → ${c.to} (موجودٌ مسبقاً)`);

    // النقطة العمياء: صفوفٌ لا حدث ATTENDANCE_RECORDED لحلقتها/يومها (تأشيرٌ فرديّ عبر الشاشة الموحّدة
    // لا يُصدر حدثاً) — لا يمكن تأريخ لحظة تسجيلها، فتُبلَّغ للعلم.
    const eventCircleDays = new Set();
    for (const e of events) {
      const pd = e.payload && typeof e.payload === "object" ? e.payload.date : undefined;
      if (typeof pd === "string") eventCircleDays.add(`${e.subjectId}|${pd}`);
    }
    const untraceable = rows.filter((r) => !eventCircleDays.has(`${r.circleId}|${utcDay(r.date)}`)).length;
    console.log(`صفوفٌ بلا حدث رصدٍ مطابق (تأشيرٌ فرديّ — غير مؤرَّخة) = ${untraceable}`);
  }
  console.log(`\n✅ READ-ONLY DIAG OK`);
} catch (e) {
  console.error("❌ QUERY FAILED:", e?.name, e?.code, e?.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
