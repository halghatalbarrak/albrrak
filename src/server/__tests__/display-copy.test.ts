import { DisplayScreenKind, Role } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createScreen, issueToken, resolveScreenByToken, revealActiveToken } from "../display/screens";
import { revealScreenToken } from "../display/admin";
import { AuthorizationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createUser } from "../testing/factories";

// نسخ رابط الشاشة (DISPLAY_SCREEN_RULES §٩): الرمز يُحفظ مشفَّراً إلى جانب sha256؛ يُسترجَع للنسخ
// لمدير الشاشات وحده، والرابط المُسترجَع يفتح الشاشة. الرموز القديمة بلا نسخةٍ مشفَّرة لا تُنسَخ.

beforeAll(() => {
  // مفتاح ٣٢ بايت (base64) للاختبار — يُقرأ وقت الاستدعاء في token-crypto.
  process.env.DISPLAY_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
});
beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("النسخ يُرجع رابطاً يفتح الشاشة", () => {
  it("الرمز المُسترجَع من نسخته المشفَّرة يحلّ الشاشة نفسها", async () => {
    const screen = await createScreen({ kind: DisplayScreenKind.MOSQUE, nameAr: "شاشة المسجد" });
    await issueToken(screen.id);

    const reveal = await revealActiveToken(screen.id);
    expect(reveal.ok).toBe(true);
    const token = reveal.ok ? reveal.token : "";
    expect(token.length).toBeGreaterThan(0);

    const resolved = await resolveScreenByToken(token);
    expect(resolved?.id).toBe(screen.id);
  });
});

describe("غير المخوَّل لا يحصل على الرمز", () => {
  it("المعلّم يُرفض، ومدير المنصّة يحصل عليه", async () => {
    const screen = await createScreen({ kind: DisplayScreenKind.MOSQUE, nameAr: "شاشة" });
    await issueToken(screen.id);

    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    await expect(revealScreenToken(teacher.id, screen.id)).rejects.toBeInstanceOf(AuthorizationError);

    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const r = await revealScreenToken(manager.id, screen.id);
    expect(r.ok).toBe(true);
  });
});

describe("الرموز القديمة بلا نسخةٍ مشفَّرة", () => {
  it("تُعيد السبب legacy (تُجدَّد لتفعيل النسخ)", async () => {
    const screen = await createScreen({ kind: DisplayScreenKind.MOSQUE, nameAr: "شاشة" });
    // رمزٌ «قديم» بلا tokenEnc — كالمُصدَر قبل ضبط المفتاح.
    await prisma.displayScreenToken.create({ data: { screenId: screen.id, tokenHash: "legacyhash", tokenEnc: null } });
    expect(await revealActiveToken(screen.id)).toEqual({ ok: false, reason: "legacy" });
  });
});
