import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import EmbeddedPostgres from "embedded-postgres";

// إعدادٌ عامٌّ لـvitest: يُشعِل Postgres مدمجًا **محليًّا مؤقّتًا** (لا Docker/WSL، لا
// إنترنت، لا مساس بـbarrak-v2)، يطبّق كل الترحيلات عليه، ثم يُطفئه ويمسح بياناته بعد
// كل التشغيلات. القاعدة على localhost فيقبلها صمّام الأمان في testing/helpers تلقائيًّا.

const PORT = 54329;
const DB = "albrrak_test";
const URL = `postgresql://postgres:postgres@localhost:${PORT}/${DB}`;

let pg: InstanceType<typeof EmbeddedPostgres> | undefined;
let dataDir: string | undefined;

export default async function () {
  dataDir = mkdtempSync(path.join(tmpdir(), "albrrak-pg-"));
  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: false, // يُمسح عند الإطفاء — قاعدةٌ عابرة
    // ترميز UTF8 صراحةً: initdb على Windows العربيّ يختار WIN1256 افتراضًا، فتفشل
    // ترحيلاتٌ فيها حروف UTF-8 (═). C locale مع UTF8 تركيبةٌ صحيحة (كما في CI).
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(DB);

  // تطبيق الترحيلات على القاعدة المحلية (لا على أي قاعدةٍ بعيدة).
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: URL, DIRECT_URL: URL },
  });

  // teardown — يُطفئ القاعدة ويمسح مجلّد بياناتها المؤقّت.
  return async () => {
    try { await pg?.stop(); } catch { /* تجاهل */ }
    if (dataDir) { try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* تجاهل */ } }
  };
}
