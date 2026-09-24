// أداة: تطبيق ترحيلات Prisma المعلّقة على الإنتاج عبر Supabase Management API (لا اتّصال مباشر).
// تكتشف المعلّق (مجلّدات prisma/migrations غير المسجّلة في _prisma_migrations)، وتطبّقه بالترتيب
// المعجميّ، ثمّ تسجّل صفّاً بـchecksum خام (sha256 لبايتات الملف — الطريقة المعتمدة، راجع checksum-gate).
// تتوقّف فوراً عند أوّل فشل بلا تسجيل. الاستعمال: node scripts/ops/apply-migrations.mjs [--apply]
// (بلا --apply: عرضٌ فقط للمعلّق دون تنفيذ).
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { query } from "./pg-api.mjs";

const APPLY = process.argv.includes("--apply");
const DIR = "prisma/migrations";

const folders = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort(); // ترتيب معجميّ = ترتيب تطبيق Prisma

const applied = new Set((await query(`SELECT migration_name FROM "_prisma_migrations";`)).map((r) => r.migration_name));
const pending = folders.filter((f) => !applied.has(f));

console.log(`مجلّدات: ${folders.length} · مطبَّق: ${applied.size} · معلّق: ${pending.length}`);
if (pending.length === 0) { console.log("لا ترحيلات معلّقة."); process.exit(0); }
for (const f of pending) console.log(`  ⏳ ${f}`);

if (!APPLY) { console.log("\n(عرضٌ فقط — أضِف --apply للتنفيذ.)"); process.exit(0); }

const esc = (s) => s.replace(/'/g, "''");
for (const name of pending) {
  const raw = readFileSync(join(DIR, name, "migration.sql")); // بايتات كما على القرص
  const checksum = createHash("sha256").update(raw).digest("hex");
  console.log(`\n▶ ${name}`);
  try {
    await query(raw.toString("utf8"));
  } catch (e) {
    console.error(`STOP: فشل تنفيذ ${name} — لا تسجيل، لا إكمال.\n  ${e.message}`);
    process.exit(1);
  }
  try {
    await query(
      `INSERT INTO "_prisma_migrations"
         (id, checksum, migration_name, started_at, finished_at, applied_steps_count, logs, rolled_back_at)
       VALUES (gen_random_uuid()::text, '${checksum}', '${esc(name)}', now(), now(), 1, NULL, NULL);`
    );
  } catch (e) {
    console.error(`STOP: نُفّذ ${name} لكن فشل تسجيل صفّه — تسويةٌ يدويّة لازمة.\n  ${e.message}`);
    process.exit(2);
  }
  console.log(`  ✓ طُبِّق وسُجِّل (checksum=${checksum.slice(0, 12)}…)`);
}
console.log("\nتمّ تطبيق كل المعلّق بلا أخطاء.");
