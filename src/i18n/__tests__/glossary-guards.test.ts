import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// حُرّاس المسرد (docs/I18N_GLOSSARY.md) — تفشل إن خالفت القواميس المترجَمة القرارات الملزمة.
// تمسح ملفّات en/ru فعليّاً (fs)، فتسري متى مُلئت في PR-2/PR-3.

function readTree(dir: string): { file: string; text: string }[] {
  if (!fs.existsSync(dir)) return [];
  const out: { file: string; text: string }[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...readTree(full));
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push({ file: full, text: fs.readFileSync(full, "utf8") });
  }
  return out;
}

const EN = path.join(process.cwd(), "src/i18n/en");
const RU = path.join(process.cwd(), "src/i18n/ru");

describe("حارس «القاعدة المدنية»: لا نقحرة Qaida/каида في أيّ قاموس en/ru", () => {
  it("لا يظهر النمط المحظور", () => {
    for (const { file, text } of [...readTree(EN), ...readTree(RU)]) {
      expect(text, `نقحرةٌ محظورة في ${file}`).not.toMatch(/qa[ʿ'’]?ida|каида/i);
    }
  });
});

describe("حارس الاقتصاد: لا ألفاظ تجارة في قاموس الاقتصاد en/ru", () => {
  const COMMERCE = /\b(shop|store|market|buy|sell|purchase|price)\b|магазин|рынок|купить|продать|цена/i;
  it("لا تظهر ألفاظ البيع/الشراء/السوق/السعر", () => {
    const economyFiles = [...readTree(EN), ...readTree(RU)].filter((f) => /(economy|market|baydar|bayder)/i.test(f.file));
    for (const { file, text } of economyFiles) {
      expect(text, `لفظ تجارةٍ محظور في ${file}`).not.toMatch(COMMERCE);
    }
  });
});
