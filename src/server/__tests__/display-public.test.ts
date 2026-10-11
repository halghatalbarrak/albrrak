import { createHash } from "node:crypto";

import { DisplayScreenKind, DisplaySlideKind, PointGrantSource, ProgramKey } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createScreen, issueToken, revokeToken } from "../display/screens";
import { getPublicScreen } from "../display/public";
import { withinRateLimit } from "../display/rate-limit";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// ش٢: القراءة العامّة — لا تكشف معرّفاتٍ داخليّة، الملغى يُرفَض، المعطّل يُستبعَد، الصفر يظهر، وحدّ معدّل.

const NOW = new Date("2026-05-20T09:00:00.000Z");

async function seedProgramWithStudents() {
  const prog = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await createCircle(prisma, prog.id);
  const item = await prisma.pointItem.create({ data: { nameAr: "منحة", value: 1, grantSource: PointGrantSource.ADMIN } });
  const students: { id: string; userId: string; pts: number }[] = [];
  // ١٢ طالباً بنقاطٍ متفاوتة، منهم واحدٌ بصفر.
  for (let i = 0; i < 12; i++) {
    const { student } = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: prog.id } });
    const pts = i === 11 ? 0 : (i + 1) * 10;
    if (pts) await prisma.pointTransaction.create({ data: { studentId: student.id, pointItemId: item.id, amount: pts, grantSource: PointGrantSource.ADMIN } });
    students.push({ id: student.id, userId: student.userId, pts });
  }
  // طالبٌ معطَّل (user.isActive=false) بنقاطٍ عالية — يجب ألّا يظهر.
  const disabled = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: disabled.student.id, circleId: circle.id, programId: prog.id } });
  await prisma.pointTransaction.create({ data: { studentId: disabled.student.id, pointItemId: item.id, amount: 9999, grantSource: PointGrantSource.ADMIN } });
  await prisma.user.update({ where: { id: disabled.student.userId }, data: { isActive: false } });
  return { prog, circle, students, disabledId: disabled.student.id };
}

const noInternalIds = (data: unknown, ids: string[]) => {
  const json = JSON.stringify(data);
  for (const id of ids) expect(json.includes(id), `تسرّب معرّف ${id}`).toBe(false);
};

describe("شاشة المسجد — ترتيب البرنامج بلا معرّفات", () => {
  it("يُرتّب تنازليّاً، يستبعد المعطَّل، يُظهر الصفر، ولا يكشف معرّفاً داخليّاً", async () => {
    const { prog, circle, students, disabledId } = await seedProgramWithStudents();
    const screen = await createScreen({ kind: DisplayScreenKind.MOSQUE, nameAr: "مسجد" }, prisma);
    await prisma.displaySlide.create({ data: { screenId: screen.id, ordinal: 0, kind: DisplaySlideKind.PROGRAM, programId: prog.id } });
    const { token } = await issueToken(screen.id, prisma);

    const r = await getPublicScreen(token, "1.2.3.4", prisma, NOW);
    expect(r.ok).toBe(true);
    const data = (r as { ok: true; data: { slides: { type: string; ranking: { rank: number; points: number; name: string }[] }[] } }).data;
    const ranking = data.slides[0].ranking;
    expect(ranking).toHaveLength(12); // ١٢ مفعّلاً (المعطّل مستبعَد)
    expect(ranking[0].points).toBe(110); // الأعلى
    expect(ranking.at(-1)!.points).toBe(0); // الصفر يظهر آخراً
    expect(ranking.map((x) => x.points)).toEqual([...ranking.map((x) => x.points)].sort((a, b) => b - a)); // تنازليّ
    noInternalIds(data, [screen.id, prog.id, circle.id, disabledId, ...students.map((s) => s.id)]);
  });
});

describe("شاشة البيت — الابن والعشرة الأوائل فقط، بلا معرّفات", () => {
  it("تُرجع الابن (بترتيبه) والعشرة الأوائل، وتُبرز الابن، بلا تسريب", async () => {
    const { prog, circle, students } = await seedProgramWithStudents();
    const son = students[5]; // نقاطه ٦٠
    const screen = await createScreen({ kind: DisplayScreenKind.HOME, nameAr: "بيت", studentId: son.id }, prisma);
    const { token } = await issueToken(screen.id, prisma);

    const r = await getPublicScreen(token, "1.2.3.4", prisma, NOW);
    expect(r.ok).toBe(true);
    const data = (r as { ok: true; data: { slides: { son: { rank: number; points: number }; top: { isSon: boolean }[] }[] } }).data;
    const slide = data.slides[0];
    expect(slide.son.points).toBe(60);
    expect(slide.son.rank).toBeGreaterThan(0);
    expect(slide.top.length).toBeLessThanOrEqual(10); // العشرة الأوائل على الأكثر
    expect(slide.top.filter((t) => t.isSon).length).toBeLessThanOrEqual(1);
    noInternalIds(data, [screen.id, prog.id, circle.id, son.id, son.userId, ...students.map((s) => s.id)]);
  });
});

describe("الرمز الملغى وحدّ المعدّل", () => {
  it("الرمز الملغى يُرفَض (404)", async () => {
    const screen = await createScreen({ kind: DisplayScreenKind.MOSQUE, nameAr: "مسجد" }, prisma);
    const { token } = await issueToken(screen.id, prisma);
    await revokeToken(screen.id, prisma);
    expect(await getPublicScreen(token, "1.2.3.4", prisma, NOW)).toEqual({ ok: false, status: 404 });
  });

  it("withinRateLimit: ٤٠ مسموحة والحادية والأربعون تتجاوز", async () => {
    let lastOk = true;
    for (let i = 0; i < 41; i++) lastOk = await withinRateLimit("tok", "9.9.9.9", prisma, NOW);
    expect(lastOk).toBe(false);
  });

  it("getPublicScreen يُرجع 429 عند تجاوز الحدّ", async () => {
    const screen = await createScreen({ kind: DisplayScreenKind.MOSQUE, nameAr: "مسجد" }, prisma);
    const { token } = await issueToken(screen.id, prisma);
    const rkey = `${createHash("sha256").update(token).digest("hex")}:5.5.5.5`;
    const windowStart = new Date(Math.floor(NOW.getTime() / 60000) * 60000);
    await prisma.displayRateHit.create({ data: { rkey, windowStart, count: 40 } }); // عند الحدّ
    expect(await getPublicScreen(token, "5.5.5.5", prisma, NOW)).toEqual({ ok: false, status: 429 });
  });
});
