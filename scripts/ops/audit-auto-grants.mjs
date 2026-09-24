// أداة تدقيق (قراءة فقط، عبر Supabase Management API): تحصر على الإنتاج كل (طالب، يوم، مجموعة
// أحداثٍ متنافية) فيه أكثر من منحٍ **غير معكوس** — أثرٌ سابقٌ لعطب تراكم النقاط قبل إصلاح م ج.
// تعرض فرق الرصيد المتراكم (مجموع قيم المنح الزائدة عن واحد). لا تصحيح، لا كتابة.
// تُشغَّل لاحقًا برمزٍ مؤقّت: SUPABASE_ACCESS_TOKEN=... node scripts/ops/audit-auto-grants.mjs
import { query } from "./pg-api.mjs";

// مجموعات الأحداث المتنافية (تطابق economy.ts: CONFLICTING_AUTO_EVENT_GROUPS).
const GROUPS = {
  ATTENDANCE: ["ATTENDANCE_PRESENT", "ATTENDANCE_LATE", "ATTENDANCE_ABSENT", "ATTENDANCE_LEFT_NO_PERMISSION"],
  QAIDAH_LESSON: ["QAIDAH_LESSON_MASTERED", "QAIDAH_LESSON_NOT_MASTERED"],
  HIFZ: ["HIFZ_DONE", "HIFZ_MISSED"],
  TARSEEKH: ["TARSEEKH_DONE", "TARSEEKH_MISSED"],
  MURAJAAH: ["MURAJAAH_DONE", "MURAJAAH_MISSED"],
};
const groupOf = (evt) => Object.keys(GROUPS).find((g) => GROUPS[g].includes(evt)) ?? null;

const allEvents = Object.values(GROUPS).flat();
const inList = allEvents.map((e) => `'${e}'`).join(", ");

// المنح النشط (غير المعكوس) لأحداث المجموعات، بقيمته من الدفتر.
const rows = await query(
  `SELECT ag."studentId", ag."sourceRef", ag."eventType", pt."amount"
   FROM "AutoGrant" ag
   JOIN "PointTransaction" pt ON pt.id = ag."pointTransactionId"
   WHERE ag."reversedAt" IS NULL AND ag."eventType" IN (${inList});`
);

// تجميع بـ(الطالب، اليوم، المجموعة).
const buckets = new Map();
for (const r of rows) {
  const g = groupOf(r.eventType);
  if (!g) continue;
  const key = `${r.studentId}|${r.sourceRef}|${g}`;
  const b = buckets.get(key) ?? { studentId: r.studentId, day: r.sourceRef, group: g, events: [], sum: 0 };
  b.events.push(`${r.eventType}(${r.amount})`);
  b.sum += Number(r.amount) || 0;
  buckets.set(key, b);
}

const conflicts = [...buckets.values()].filter((b) => b.events.length > 1);
console.log(`منحٌ نشطٌ ضمن المجموعات: ${rows.length} · حالات تعارضٍ (>1 في نفس اليوم/المجموعة): ${conflicts.length}`);
if (conflicts.length === 0) { console.log("لا تعارض — نظيف."); process.exit(0); }

conflicts.sort((a, b) => (a.studentId + a.day).localeCompare(b.studentId + b.day));
for (const c of conflicts) {
  console.log(`  طالب ${c.studentId} · يوم ${c.day} · ${c.group}: ${c.events.join(" + ")} · مجموع=${c.sum}`);
}
console.log(`\nإجماليّ حالات التعارض: ${conflicts.length}. (تدقيقٌ فقط — لا تصحيح.)`);
