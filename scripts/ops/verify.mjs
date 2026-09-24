// أداة: التحقّق بعد كل دمجٍ بمطابقة _prisma_migrations (على الإنتاج عبر الـAPI) بمجلّد
// prisma/migrations. تعرض المطبَّق، والمعلّق (مجلّدٌ بلا صفّ)، واليتيم (صفٌّ بلا مجلّد)،
// وأي صفٍّ غير منتهٍ (finished_at فارغ) أو مُرجَع (rolled_back). الاستعمال: node scripts/ops/verify.mjs
import { readdirSync } from "node:fs";
import { query } from "./pg-api.mjs";

const folders = new Set(
  readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
);
const rows = await query(
  `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at ASC;`
);
const dbNames = new Set(rows.map((r) => r.migration_name));

const pending = [...folders].filter((f) => !dbNames.has(f)).sort();          // مجلّد بلا صفّ
const orphan = rows.filter((r) => !folders.has(r.migration_name));            // صفّ بلا مجلّد
const unfinished = rows.filter((r) => !r.finished_at);
const rolledBack = rows.filter((r) => r.rolled_back_at);

console.log(`مجلّدات محلّيّة: ${folders.size} · صفوف _prisma_migrations: ${rows.length}`);
console.log(`معلّق (مجلّد بلا صفّ): ${pending.length}${pending.length ? " → " + pending.join(", ") : ""}`);
console.log(`يتيم (صفّ بلا مجلّد): ${orphan.length}${orphan.length ? " → " + orphan.map((r) => r.migration_name).join(", ") : ""}`);
console.log(`غير منتهٍ (finished_at فارغ): ${unfinished.length}${unfinished.length ? " → " + unfinished.map((r) => r.migration_name).join(", ") : ""}`);
console.log(`مُرجَع (rolled_back): ${rolledBack.length}${rolledBack.length ? " → " + rolledBack.map((r) => r.migration_name).join(", ") : ""}`);

const ok = pending.length === 0 && orphan.length === 0 && unfinished.length === 0 && rolledBack.length === 0;
console.log(ok ? "\n✓ متطابق: كل مجلّدٍ مطبَّقٌ ومنتهٍ، ولا يتيم." : "\n✗ عدم تطابق: راجع أعلاه.");
process.exit(ok ? 0 : 1);
