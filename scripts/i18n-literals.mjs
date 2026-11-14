// بوّابة التوطين: تعدّ النصوص العربيّة الحرفيّة الباقية وتمنع ازديادها.
//   (أ) throw بنصٍّ عربيٍّ حرفيّ: new ValidationError/Error/AuthorizationError/AuthenticationError("…عربي…").
//   (ب) نصوص JSX عربيّة خارج src/i18n (نصٌّ بين > و< فيه حرفٌ عربيّ).
// تقارن العدّين بسقفٍ محفوظ في i18n-baseline.json، وتفشل إن زاد أيٌّ منهما (CI).
// السقف يُخفَّض في كلّ PR توطين: `node scripts/i18n-literals.mjs --update`.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const BASELINE = join(ROOT, "i18n-baseline.json");
const AR = /[؀-ۿ]/; // أيّ حرفٍ عربيّ

const THROW_RE = /new\s+(?:ValidationError|AuthorizationError|AuthenticationError|Error)\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
const JSX_RE = />([^<>{}]*)</g;

/** كلّ ملفّات .ts/.tsx تحت src، مع مسارٍ نسبيٍّ بفواصل «/». */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");

let throws = 0, jsx = 0;
for (const file of walk(SRC)) {
  const r = rel(file);
  if (r.startsWith("src/i18n/")) continue; // القواميس نفسها تحمل العربيّة عمدًا
  const text = readFileSync(file, "utf8");

  if (!r.includes("/__tests__/")) {
    for (const m of text.matchAll(THROW_RE)) if (AR.test(m[2])) throws++;
  }
  // نصوص JSX: في صفحات/مكوّنات الواجهة فقط.
  if (r.includes("/design-preview/")) continue; // نصوص عرض التصميم مقصودة ومعزولة
  if (r.endsWith(".tsx") && (r.startsWith("src/app/") || r.startsWith("src/components/"))) {
    for (const m of text.matchAll(JSX_RE)) if (AR.test(m[1])) jsx++;
  }
}

const current = { throws, jsx };
if (process.argv.includes("--update")) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + "\n");
  console.log(`✅ حُدِّث السقف: ${JSON.stringify(current)}`);
  process.exit(0);
}

let base;
try { base = JSON.parse(readFileSync(BASELINE, "utf8")); }
catch { console.error("❌ i18n-baseline.json غير موجود — شغّل: node scripts/i18n-literals.mjs --update"); process.exit(1); }

console.log(`throws: ${current.throws} (سقف ${base.throws}) · jsx: ${current.jsx} (سقف ${base.jsx})`);
const over = [];
if (current.throws > base.throws) over.push(`throws ازداد ${base.throws} ← ${current.throws}`);
if (current.jsx > base.jsx) over.push(`jsx ازداد ${base.jsx} ← ${current.jsx}`);
if (over.length) {
  console.error("❌ ازدياد نصوصٍ حرفيّة: " + over.join(" · ") + " — انقلها إلى قاموس i18n.");
  process.exit(1);
}
if (current.throws < base.throws || current.jsx < base.jsx) {
  console.log("ℹ️ انخفض العدد — حدِّث السقف: node scripts/i18n-literals.mjs --update");
}
console.log("✅ لا ازدياد في النصوص الحرفيّة.");
