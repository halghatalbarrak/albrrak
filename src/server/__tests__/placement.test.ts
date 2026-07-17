import { ApprovalStatus, ProgramKey, Role, StudentState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideReadingTest, proposeReadingTest } from "../placement";
import { ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function scene() {
  const { student } = await createStudent(prisma);
  await prisma.student.update({
    where: { id: student.id },
    data: { state: StudentState.AWAITING_READING_TEST },
  });
  const qaidah = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
  const circle = await createCircle(prisma, qaidah.id);
  const registrar = await createUser(prisma, { roles: [Role.REGISTRAR] });
  const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
  return { student, circle, registrar, manager };
}

describe("§٦٫٣ اختبار القراءة — المُسجِّل يقترح ← المدير يعتمد ← الإسناد", () => {
  it("لا يجيد نظراً ← اعتماد ← Enrollment + IN_QAIDAH", async () => {
    const s = await scene();
    const approval = await proposeReadingTest({
      studentId: s.student.id,
      examinerId: s.registrar.id,
      notes: "يتهجّى الحروف",
      readsFluently: false,
      circleId: s.circle.id,
    });
    // قبل الاعتماد: لا إسناد، والحالة لم تتغيّر.
    expect(await prisma.enrollment.count({ where: { studentId: s.student.id } })).toBe(0);

    const res = await decideReadingTest({
      approvalId: approval.id,
      decidedBy: s.manager.id,
      decision: "APPROVED",
    });
    expect(res.outcome).toBe("QAIDAH");
    const student = await prisma.student.findUniqueOrThrow({ where: { id: s.student.id } });
    expect(student.state).toBe(StudentState.IN_QAIDAH);
    expect(
      await prisma.enrollment.count({ where: { studentId: s.student.id, endedAt: null } }),
    ).toBe(1);
  });

  it("يجيد نظراً ← اعتماد ← AWAITING_PACE_TEST بلا حلقة", async () => {
    const s = await scene();
    const approval = await proposeReadingTest({
      studentId: s.student.id,
      examinerId: s.registrar.id,
      notes: "يقرأ بطلاقة",
      readsFluently: true,
    });
    const res = await decideReadingTest({
      approvalId: approval.id,
      decidedBy: s.manager.id,
      decision: "APPROVED",
    });
    expect(res.outcome).toBe("MARAQI_BOUND");
    const student = await prisma.student.findUniqueOrThrow({ where: { id: s.student.id } });
    expect(student.state).toBe(StudentState.AWAITING_PACE_TEST);
    expect(await prisma.enrollment.count({ where: { studentId: s.student.id } })).toBe(0);
  });

  it("رفضٌ بسبب ← يبقى بانتظار اختبار القراءة، والاعتماد REJECTED", async () => {
    const s = await scene();
    const approval = await proposeReadingTest({
      studentId: s.student.id,
      examinerId: s.registrar.id,
      notes: "غير واضح",
      readsFluently: false,
      circleId: s.circle.id,
    });
    const res = await decideReadingTest({
      approvalId: approval.id,
      decidedBy: s.manager.id,
      decision: "REJECTED",
      note: "أعيدوا الاختبار بحضوري",
    });
    expect(res.applied).toBe(false);
    const student = await prisma.student.findUniqueOrThrow({ where: { id: s.student.id } });
    expect(student.state).toBe(StudentState.AWAITING_READING_TEST);
    const a = await prisma.approval.findUniqueOrThrow({ where: { id: approval.id } });
    expect(a.status).toBe(ApprovalStatus.REJECTED);
  });

  it("الرفض بلا سبب ← يُرفض", async () => {
    const s = await scene();
    const approval = await proposeReadingTest({
      studentId: s.student.id,
      examinerId: s.registrar.id,
      notes: "x",
      readsFluently: true,
    });
    await expect(
      decideReadingTest({ approvalId: approval.id, decidedBy: s.manager.id, decision: "REJECTED" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("طالبٌ ليس بانتظار القراءة ← يُرفض الاقتراح", async () => {
    const s = await scene();
    await prisma.student.update({ where: { id: s.student.id }, data: { state: StudentState.IN_QAIDAH } });
    await expect(
      proposeReadingTest({
        studentId: s.student.id,
        examinerId: s.registrar.id,
        notes: "x",
        readsFluently: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("اقتراحٌ ثانٍ وقرارٌ معلّقٌ قائم ← يُرفض", async () => {
    const s = await scene();
    await proposeReadingTest({
      studentId: s.student.id,
      examinerId: s.registrar.id,
      notes: "x",
      readsFluently: true,
    });
    await expect(
      proposeReadingTest({
        studentId: s.student.id,
        examinerId: s.registrar.id,
        notes: "y",
        readsFluently: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("القاعدة المدنية بلا حلقة ← يُرفض", async () => {
    const s = await scene();
    await expect(
      proposeReadingTest({
        studentId: s.student.id,
        examinerId: s.registrar.id,
        notes: "x",
        readsFluently: false,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("حلقةٌ من برنامجٍ غير القاعدة المدنية ← يُرفض", async () => {
    const s = await scene();
    const maraqi = await createProgram(prisma, ProgramKey.MARAQI);
    const maraqiCircle = await createCircle(prisma, maraqi.id);
    await expect(
      proposeReadingTest({
        studentId: s.student.id,
        examinerId: s.registrar.id,
        notes: "x",
        readsFluently: false,
        circleId: maraqiCircle.id,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
