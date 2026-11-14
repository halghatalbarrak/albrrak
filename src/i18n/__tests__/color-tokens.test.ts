import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// بوّابة الألوان المُضمَّنة — مشابهة لبوّابة المسرد.
// تمسح كلّ ملفّات .ts/.tsx في src/ وتحصي الألوان المُضمَّنة (هكس / rgba).
// السقف: 0 — ألوان themeColor معفاةٌ بـEXEMPT_LINE (metadata في Next.js لا تقبل CSS vars).

const MAX_HARDCODED = 0;

// نمط اللون المُضمَّن: هكس ≥٦ أرقام، أو rgba?()
const COLOR_RE = /#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?\b|rgba?\s*\(\s*\d/g;

// الملفّات المستثناة من الفحص
const EXCLUDED: RegExp[] = [
  /globals\.css$/,
  /tokens\.ts$/,
  /color-tokens\.test\.ts$/,
  /[/\\]node_modules[/\\]/,
  /[/\\]\.next[/\\]/,
  /\.d\.ts$/,
  /[/\\]prisma[/\\]/,
  // certificate.ts: قالب HTML مستقلّ لشهادة PDF — ألوانه ثابتة بقصد، لا تعتمد على CSS vars.
  /certificate\.ts$/,
  // مسارات API (server-side): QR code وغيرها تحتاج قيماً صريحة.
  /[/\\]app[/\\]api[/\\]/,
];

// الأسطر المعفاة (themeColor — Next.js metadata، وأسطر التعليق)
const EXEMPT_LINE = /themeColor|\/\/|^\s*\*/;

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next" || name === ".git" || name === "prisma") continue;
      out.push(...collectFiles(full));
    } else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("بوّابة الألوان المُضمَّنة", () => {
  it(`عدد الألوان المُضمَّنة في مكوّنات src/ ≤ ${MAX_HARDCODED}`, () => {
    const src = path.join(process.cwd(), "src");
    const files = collectFiles(src).filter(
      (f) => !EXCLUDED.some((re) => re.test(f))
    );

    type Hit = { file: string; line: number; text: string };
    const hits: Hit[] = [];

    for (const file of files) {
      const lines = fs.readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (EXEMPT_LINE.test(line)) continue;
        const matches = line.match(COLOR_RE);
        if (matches) {
          for (const m of matches) {
            hits.push({ file, line: i + 1, text: m });
          }
        }
      }
    }

    if (hits.length > MAX_HARDCODED) {
      const list = hits
        .map((h) => `  ${path.relative(process.cwd(), h.file)}:${h.line}  →  ${h.text}`)
        .join("\n");
      expect.fail(
        `وُجد ${hits.length} لوناً مُضمَّناً (الحدّ: ${MAX_HARDCODED}). استبدلها بتوكنات ui.color.*:\n${list}`
      );
    }

    expect(hits.length).toBeLessThanOrEqual(MAX_HARDCODED);
  });
});
