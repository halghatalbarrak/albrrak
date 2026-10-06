import { ProgramKey, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  assignSupervisor,
  assertCanManageMuddakir,
  assertCanViewMuddakir,
  canManageMuddakir,
  canViewMuddakir,
  enrollInMuddakir,
  listHafizForSupervisor,
  listSupervisorsWithLoad,
} from "../muddakir-enrollment";
import { scheduleTransition, resolveStudentProgram } from "../program-placement";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// resetDb يمسح كلّ الجداول (ومنها Program المبذور)، فيُعاد بناء المُدَّكِر وحلقةٍ وقيدٍ في كل اختبار.
async function scaffold() {
  const mud = await createProgram(prisma, ProgramKey.MUDDAKIR);
  const other = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await createCircle(prisma, other.id);
  const mgr = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
  return { mud, other, circle, mgr };
}

async function enrolledStudent(circleId: string, programId: string) {
  const { student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId, programId } });
  return student;
}

describe("enrollInMuddakir — إلحاق idempotent", () => {
  it("الإلحاق مرّتين لا يكرّر قيدًا ولا ملفًّا، وبقيمٍ افتراضيّة", async () => {
    const { mud, other, circle, mgr } = await scaffold();
    const s = await enrolledStudent(circle.id, other.id);

    const r1 = await enrollInMuddakir({ studentId: s.id, actorId: mgr.id });
    expect(r1.alreadyEnrolled).toBe(false);
    const r2 = await enrollInMuddakir({ studentId: s.id, actorId: mgr.id });
    expect(r2.alreadyEnrolled).toBe(true);

    const active = await prisma.enrollment.findMany({ where: { studentId: s.id, endedAt: null } });
    expect(active).toHaveLength(1);
    expect(active[0].programId).toBe(mud.id);
    expect(active[0].circleId).toBe(circle.id); // نفس الحلقة

    const profiles = await prisma.muddakirProfile.findMany({ where: { studentId: s.id } });
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ track: 1, currentStageId: "1", mode: "ACTIVE", deliveryMode: "IN_PERSON" });
  });

  it("يرفض الإلحاق بلا حلقةٍ نشطة", async () => {
    await scaffold();
    const { student } = await createStudent(prisma); // بلا قيد
    await expect(enrollInMuddakir({ studentId: student.id, actorId: "x" })).rejects.toThrow();
  });
});

describe("الانتقال التلقائيّ من البرنامج السابق (nextProgramId ⟵ المُدَّكِر)", () => {
  it("دخول الطالب للمُدَّكِر عبر resolveStudentProgram ينشئ الملفّ تلقائيًّا", async () => {
    const { mud, other, circle } = await scaffold();
    const s = await enrolledStudent(circle.id, other.id);
    const track = await prisma.track.create({ data: { programId: mud.id, nameAr: "ت", linesPerDay: 1, ordinal: 1 } });

    await scheduleTransition(prisma, { studentId: s.id, nextProgramId: mud.id, trackId: track.id, from: new Date() });
    const view = await resolveStudentProgram(prisma, s.id, new Date());

    expect(view.programKey).toBe(ProgramKey.MUDDAKIR);
    const profile = await prisma.muddakirProfile.findUnique({ where: { studentId: s.id } });
    expect(profile).not.toBeNull();
    expect(profile?.track).toBe(1);
  });
});

describe("assignSupervisor — السقف آمنٌ من التسابق + إعادة الإسناد", () => {
  it("السقف ٤: طلبان متزامنان على مشرفٍ عنده ٣ ⟵ واحدٌ ينجح وواحدٌ يُرفض (الحمل ٤)", async () => {
    const { other, circle } = await scaffold();
    const sup = await createUser(prisma, { roles: [Role.ARIF] });
    const hafiz = [];
    for (let i = 0; i < 5; i++) {
      const s = await enrolledStudent(circle.id, other.id);
      await enrollInMuddakir({ studentId: s.id, actorId: sup.id });
      hafiz.push(s);
    }
    for (let i = 0; i < 3; i++) await assignSupervisor({ studentId: hafiz[i].id, supervisorId: sup.id, actorId: sup.id });

    const results = await Promise.allSettled([
      assignSupervisor({ studentId: hafiz[3].id, supervisorId: sup.id, actorId: sup.id }),
      assignSupervisor({ studentId: hafiz[4].id, supervisorId: sup.id, actorId: sup.id }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    const load = await prisma.muddakirSupervision.count({ where: { supervisorId: sup.id, endedAt: null } });
    expect(load).toBe(4);
  });

  it("إعادة الإسناد تُنهي الإسناد السابق (endedAt) ولا تحذفه", async () => {
    const { other, circle } = await scaffold();
    const sup1 = await createUser(prisma, { roles: [Role.ARIF] });
    const sup2 = await createUser(prisma, { roles: [Role.ARIF] });
    const s = await enrolledStudent(circle.id, other.id);
    await enrollInMuddakir({ studentId: s.id, actorId: sup1.id });

    await assignSupervisor({ studentId: s.id, supervisorId: sup1.id, actorId: sup1.id });
    await assignSupervisor({ studentId: s.id, supervisorId: sup2.id, actorId: sup2.id });

    const all = await prisma.muddakirSupervision.findMany({ where: { studentId: s.id } });
    expect(all).toHaveLength(2); // لا حذف
    const active = all.filter((a) => a.endedAt === null);
    expect(active).toHaveLength(1);
    expect(active[0].supervisorId).toBe(sup2.id);
    expect(all.find((a) => a.endedAt !== null)?.supervisorId).toBe(sup1.id);
  });

  it("يرفض الإسناد لمستخدمٍ ليس بدور المشرف (ARIF)", async () => {
    const { other, circle } = await scaffold();
    const notArif = await createUser(prisma, { roles: [Role.TEACHER] });
    const s = await enrolledStudent(circle.id, other.id);
    await enrollInMuddakir({ studentId: s.id, actorId: "x" });
    await expect(assignSupervisor({ studentId: s.id, supervisorId: notArif.id, actorId: "x" })).rejects.toThrow();
  });
});

describe("الصلاحيّات والعروض", () => {
  it("حرّاس الأدوار: المدير يُدير، والمشرف يرى فقط، وغيرهما ممنوع", () => {
    expect(canManageMuddakir([Role.SUPER_ADMIN])).toBe(true);
    expect(canManageMuddakir([Role.CIRCLE_MANAGER])).toBe(true);
    expect(canManageMuddakir([Role.ARIF])).toBe(false);
    expect(() => assertCanManageMuddakir([Role.ARIF])).toThrow();
    expect(canViewMuddakir([Role.ARIF])).toBe(true);
    expect(canViewMuddakir([Role.TEACHER])).toBe(false);
    expect(() => assertCanViewMuddakir([Role.TEACHER])).toThrow();
    expect(() => assertCanViewMuddakir([Role.CIRCLE_MANAGER])).not.toThrow();
  });

  it("المشرف يرى حفّاظه فقط، والحمل يظهر مع السقف", async () => {
    const { other, circle } = await scaffold();
    const sup1 = await createUser(prisma, { roles: [Role.ARIF] });
    const sup2 = await createUser(prisma, { roles: [Role.ARIF] });
    const mine = await enrolledStudent(circle.id, other.id);
    const theirs = await enrolledStudent(circle.id, other.id);
    await enrollInMuddakir({ studentId: mine.id, actorId: "x" });
    await enrollInMuddakir({ studentId: theirs.id, actorId: "x" });
    await assignSupervisor({ studentId: mine.id, supervisorId: sup1.id, actorId: "x" });
    await assignSupervisor({ studentId: theirs.id, supervisorId: sup2.id, actorId: "x" });

    const mineOnly = await listHafizForSupervisor(sup1.id);
    expect(mineOnly.map((h) => h.studentId)).toEqual([mine.id]);

    const loads = await listSupervisorsWithLoad();
    const l1 = loads.find((l) => l.id === sup1.id)!;
    expect(l1).toMatchObject({ load: 1, max: 4, full: false });
  });
});
