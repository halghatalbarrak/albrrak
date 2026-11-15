import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

// الملفات المسموح لها بتعريف font-family مباشرة
const ALLOWED_PATHS = ["src/app/globals.css", "src/app/legacy.css", "src/components/ui/tokens.ts"];

// نمط الخط القرآني (مستثنى)
const QURANIC = /amiri|me_quran|quran|hafs|warsh|naskh/i;

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full));
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(full);
  }
  return out;
}

describe("font-family tokens guard", () => {
  it("لا يوجد font-family مكتوب مباشرة خارج ملفات الـ tokens/globals", () => {
    const root = join(__dirname, "../../..");
    const src = join(root, "src");
    const violations: string[] = [];

    for (const file of collectFiles(src)) {
      const rel = file.replace(root + "/", "").replace(root + "\\", "").replace(/\\/g, "/");
      if (ALLOWED_PATHS.some((a) => rel.endsWith(a))) continue;

      const lines = readFileSync(file, "utf-8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // يمنع سلاسل font-family حرفية (ليست var() أو inherit أو ui.font)
        const inlineFont = /fontFamily\s*:\s*["']/.test(line);
        const cssFont = /font-family\s*:\s*(?!inherit|var\()/.test(line);
        if ((inlineFont || cssFont) && !QURANIC.test(line)) {
          violations.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
