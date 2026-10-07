// مولّد ترحيل بيانات وحدات مراقي (مراقي ٢) من مراجعة المعلّم المعتمدة.
// يقرأ prisma/data/maraqi-tracks.json ويُصدر SQL ترحيلٍ (LF) يستبدل وحدات المسارات ١..٥
// بالوحدات المراجَعة، ويعطّل المسارات ٦/٧/٨ (بلا حذف)، مع حارسٍ يوقف إن أُسنِد طالبٌ إليها.
// الاستعمال: node scripts/gen-maraqi-tracks-migration.mjs  (يكتب ملف الترحيل، بلا اتصال قاعدة)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "prisma", "data", "maraqi-tracks.json");
const OUT_DIR = path.join(ROOT, "prisma", "migrations", "9zzzzzzzzzzzzzzzzzzzzzz_maraqi_tracks_v2");
const OUT = path.join(OUT_DIR, "migration.sql");

// المعرّفات الثابتة من ترحيل البذر (11_maraqi_stages_tracks) — المطابقة بمقدار الأسطر (key).
const TRACK_ID = { "3": "mrq_trk_1", "5": "mrq_trk_2", "7.5": "mrq_trk_3", "15": "mrq_trk_4", "30": "mrq_trk_5" };
const DEACTIVATE = ["mrq_trk_6", "mrq_trk_7", "mrq_trk_8"]; // ٣/٤/٥ صفحات — خارج مراجعة المعلّم

const j = JSON.parse(readFileSync(DATA, "utf8"));
const activeIds = j.tracks.map((t) => TRACK_ID[t.key]);
for (const t of j.tracks) if (!TRACK_ID[t.key]) throw new Error(`لا معرّف مسارٍ لـkey=${t.key}`);

const lines = [];
lines.push("-- مراقي ٢: استبدال وحدات المسارات ١..٥ بوحدات مراجعة المعلّم المعتمدة، وتعطيل ٦/٧/٨ (بلا حذف).");
lines.push("-- مولَّدٌ من prisma/data/maraqi-tracks.json عبر scripts/gen-maraqi-tracks-migration.mjs — لا يُحرَّر يدويًّا.");
lines.push("-- يعتمد «_maraqi_tracks_fields» قبله. بلا FK (نمط الجداول المتأخّرة). معرّفات الوحدات حتميّة فالترحيل قابلٌ لإعادة التشغيل.");
lines.push("");
lines.push("-- حارسٌ: لا تعطيل مسارٍ أُسنِد إليه طالبٌ نشطٌ (لا مساس ببيانات الطلاب).");
lines.push("DO $$");
lines.push("BEGIN");
lines.push(`  IF EXISTS (SELECT 1 FROM "TrackAssignment" WHERE "trackId" IN (${DEACTIVATE.map((x) => `'${x}'`).join(", ")}) AND "endedAt" IS NULL) THEN`);
lines.push("    RAISE EXCEPTION 'طلابٌ مُسنَدون لمسارات ٣/٤/٥ صفحات — أوقِف الإسناد قبل تعطيلها.';");
lines.push("  END IF;");
lines.push("END $$;");
lines.push("");
lines.push(`-- استبدال الوحدات للمسارات المراجَعة (حذف المرجعيّ القديم ثمّ إدراج المعتمد).`);
lines.push(`DELETE FROM "TrackUnit" WHERE "trackId" IN (${activeIds.map((x) => `'${x}'`).join(", ")});`);
lines.push("");

let total = 0;
for (const t of j.tracks) {
  const trk = TRACK_ID[t.key];
  lines.push(`-- مسار «${t.name}» (${t.key}) — ${t.units.length} وحدة، حتى سورة ${t.endSurah}`);
  const values = t.units.map((u) => {
    const seq = u.seq;
    const id = `mrq_u_${t.key.replace(".", "_")}_${seq}`;
    return `  ('${id}', '${trk}', ${seq}, ${u.from[0]}, ${u.from[1]}, ${u.to[0]}, ${u.to[1]})`;
  });
  lines.push(`INSERT INTO "TrackUnit" ("id","trackId","unitNo","startSurah","startAyah","endSurah","endAyah") VALUES`);
  lines.push(values.join(",\n") + ";");
  lines.push("");
  total += t.units.length;
}

lines.push("-- تعطيل المسارات خارج مراجعة المعلّم (بلا حذف).");
lines.push(`UPDATE "Track" SET "isActive" = false WHERE "id" IN (${DEACTIVATE.map((x) => `'${x}'`).join(", ")});`);
lines.push("");

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, lines.join("\n"), { encoding: "utf8" }); // LF (gitattributes يثبّتها)
console.log(`كُتب الترحيل: ${path.relative(ROOT, OUT)} — ${total} وحدة عبر ${j.tracks.length} مسارات.`);
