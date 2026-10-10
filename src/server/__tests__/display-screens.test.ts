import { createHash } from "node:crypto";

import { DisplayScreenKind } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { splitDisplayName } from "@/lib/display-name";
import { createScreen, issueToken, resolveScreenByToken, revokeToken } from "../display/screens";
import { prisma, resetDb } from "../testing/helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ش١ (§٣أ/§٥): مُقسِّم الاسم، والرمز (sha256 فقط، تجديدٌ يُبطل القديم، append-only بلا حذف).

describe("splitDisplayName — الأوّل + الأب + العائلة", () => {
  it("ثلاث كلمات ⟵ الثلاثة؛ وأربع ⟵ الأوّل والأب والعائلة (يُسقط الجدّ)", () => {
    expect(splitDisplayName("عبدالله محمد القحطاني").display).toBe("عبدالله محمد القحطاني");
    expect(splitDisplayName("عبدالله محمد سعد القحطاني").display).toBe("عبدالله محمد القحطاني");
  });
  it("كلمتان ⟵ الاسمان؛ وواحدة ⟵ الأوّل", () => {
    expect(splitDisplayName("محمد القحطاني").display).toBe("محمد القحطاني");
    expect(splitDisplayName("محمد").display).toBe("محمد");
  });
  it("يُسقط «بن»؛ ويدمج «آل» بما بعدها", () => {
    expect(splitDisplayName("خالد بن عبدالله").display).toBe("خالد عبدالله");
    expect(splitDisplayName("فهد عبدالعزيز آل سعود").display).toBe("فهد عبدالعزيز آل سعود");
  });
});

async function homeScreen() {
  return createScreen({ kind: DisplayScreenKind.HOME, nameAr: "بيت فلان", studentId: "stud-1" }, prisma);
}

describe("رمز الشاشة — sha256 فقط، تجديدٌ يُبطل القديم", () => {
  it("يُخزَّن hash لا نصّاً صريحاً، والصريح يحلّ الشاشة", async () => {
    const s = await homeScreen();
    const { token } = await issueToken(s.id, prisma);
    const row = await prisma.displayScreenToken.findFirstOrThrow({ where: { screenId: s.id } });
    expect(row.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(row.tokenHash).not.toBe(token); // ليس النصّ الصريح
    expect((await resolveScreenByToken(token, prisma))?.id).toBe(s.id);
  });

  it("التجديد يُبطل الرمز القديم (يُرفَض) ويُبقي رمزاً فعّالاً واحداً", async () => {
    const s = await homeScreen();
    const first = (await issueToken(s.id, prisma)).token;
    const second = (await issueToken(s.id, prisma)).token;
    expect(await resolveScreenByToken(first, prisma)).toBeNull(); // القديم مرفوض
    expect((await resolveScreenByToken(second, prisma))?.id).toBe(s.id);
    // append-only: صفّان (قديمٌ ملغًى + جديد)، وفعّالٌ واحد.
    expect(await prisma.displayScreenToken.count({ where: { screenId: s.id } })).toBe(2);
    expect(await prisma.displayScreenToken.count({ where: { screenId: s.id, revokedAt: null } })).toBe(1);
  });

  it("الإلغاء اليدويّ يرفض الرمز", async () => {
    const s = await homeScreen();
    const { token } = await issueToken(s.id, prisma);
    expect((await revokeToken(s.id, prisma)).revoked).toBe(1);
    expect(await resolveScreenByToken(token, prisma)).toBeNull();
  });

  it("رمزٌ غير موجودٍ أو خاطئٌ بطولٍ صحيح يُرفَض", async () => {
    const s = await homeScreen();
    await issueToken(s.id, prisma);
    expect(await resolveScreenByToken("لا-وجود-له", prisma)).toBeNull();
    expect(await resolveScreenByToken("Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFi", prisma)).toBeNull(); // ٣٢ محرفاً خاطئة
    expect(await resolveScreenByToken("", prisma)).toBeNull();
  });

  it("شاشة البيت تلزمها ربطُ ابن؛ والمسجد بلا ابن", async () => {
    await expect(createScreen({ kind: DisplayScreenKind.HOME, nameAr: "بيت" }, prisma)).rejects.toThrow();
    await expect(createScreen({ kind: DisplayScreenKind.MOSQUE, nameAr: "مسجد", studentId: "x" }, prisma)).rejects.toThrow();
  });
});
