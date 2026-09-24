// أداة: تحديد طريقة حساب checksum التي يعتمدها Prisma على الإنتاج، بمطابقة checksum ترحيلٍ
// مطبَّقٍ مع sha256(hex) لبايتات ملفه المحلّي (خام / LF / CRLF). تُستعمل قبل apply-migrations
// للتأكّد أن الطريقة «raw» ما تزال المطابِقة. الاستعمال: node scripts/ops/checksum-gate.mjs [migration_name]
// (بلا وسيط: يختار آخر ترحيلٍ مطبَّقٍ له مجلّدٌ محلّيّ).
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { query } from "./pg-api.mjs";

const DIR = "prisma/migrations";
let name = process.argv[2];
if (!name) {
  const folders = new Set(readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name));
  const applied = (await query(`SELECT migration_name FROM "_prisma_migrations" ORDER BY started_at ASC;`)).map((r) => r.migration_name);
  const localApplied = applied.filter((n) => folders.has(n));
  name = localApplied.sort().at(-1); // آخر مطبَّقٍ له مجلّد
  if (!name) { console.error("STOP: لا ترحيلٌ مطبَّقٌ له مجلّدٌ محلّيّ للمقارنة."); process.exit(1); }
}

const rows = await query(`SELECT checksum FROM "_prisma_migrations" WHERE migration_name = '${name.replace(/'/g, "''")}';`);
if (!rows.length) { console.error(`STOP: لا صفَّ للترحيل ${name} على الإنتاج.`); process.exit(1); }
const stored = rows[0].checksum;

const raw = readFileSync(join(DIR, name, "migration.sql"));
const lf = Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
const crlf = Buffer.from(lf.toString("utf8").replace(/\n/g, "\r\n"), "utf8");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const methods = { raw: sha(raw), lf: sha(lf), crlf: sha(crlf) };

console.log("migration:", name);
console.log("stored   :", stored);
for (const [k, v] of Object.entries(methods)) console.log(`  ${k.padEnd(4)}: ${v}${v === stored ? "  <== MATCH" : ""}`);
const match = Object.entries(methods).find(([, v]) => v === stored);
if (!match) { console.error("STOP: لا تطابق أيّ طريقة."); process.exit(1); }
console.log("ADOPTED METHOD:", match[0]);
