import { ProgramKey, Role, StudentState, AttendanceStatus, GuardianLinkStatus } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { renderWeeklyReport, generateWeeklyMessages, notifyAbsence, getGuardianInbox, markMessageRead, weekStartSunday, KIND_WEEKLY, KIND_ABSENCE } from "../guardian-messages";
import { prisma, resetDb } from "../testing/helpers";
import { createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const SUN = new Date("2026-05-03"); // الأحد

async function scaffold() {
  const program = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await prisma.circle.create({ data: { nameAr: "حلقة الفجر", timeSlot: "MAGHRIB", gender: "MALE", programId: program.id } });
  const { user, student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id } });
  await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
  const guardian = await createUser(prisma, { roles: [Role.GUARDIAN] });
  await prisma.guardianLink.create({ data: { guardianId: guardian.id, studentId: student.id, status: GuardianLinkStatus.ACTIVE } });
  return { program, circle, user, student, guardian };
}

describe("renderWeeklyReport — بالحدود، بلا رقم حزب، أرقامٌ هنديّة", () => {
  it("طالبٌ حاضرٌ وحافظ ⟵ تقريرٌ بالحدود بلا كلمة «حزب»", async () => {
    const { circle, student } = await scaffold();
    for (const d of ["2026-05-03", "2026-05-04", "2026-05-05", "2026-05-06"]) {
      await prisma.attendance.create({ data: { studentId: student.id, circleId: circle.id, date: new Date(d), status: AttendanceStatus.PRESENT, recordedBy: "t" } });
    }
    await prisma.dailySession.create({ data: { studentId: student.id, circleId: circle.id, date: new Date("2026-05-04"), hifzFromSurah: 114, hifzFromAyah: 1, hifzToSurah: 114, hifzToAyah: 6, hifzMastered: true } });

    const r = await renderWeeklyReport(student.id, SUN, prisma);
    expect(r).not.toBeNull();
    expect(r!.present).toBe(4);
    expect(r!.body).toContain("حضر ٤ من ٥"); // أرقامٌ هنديّة
    expect(r!.body).not.toContain("حزب"); // §٨٫٢
    expect(r!.subject).toContain("تقرير الأسبوع");
  });

  it("غائبٌ طول الأسبوع ⟵ رسالةٌ مطمئنةٌ لا معاتِبة", async () => {
    const { student } = await scaffold();
    const r = await renderWeeklyReport(student.id, SUN, prisma);
    expect(r!.present).toBe(0);
    expect(r!.body).toContain("نسأل الله أن يكون بخير");
    expect(r!.body).not.toContain("الحضور");
  });
});

describe("generateWeeklyMessages / notifyAbsence — توليدٌ ومنعُ تكرار", () => {
  it("يولّد رسالةً لكل طالب، ولا يكرّر الأسبوع نفسه", async () => {
    await scaffold();
    expect(await generateWeeklyMessages(SUN, prisma)).toBe(1);
    expect(await generateWeeklyMessages(SUN, prisma)).toBe(0); // منع التكرار
    expect(await prisma.guardianMessage.count({ where: { kind: KIND_WEEKLY } })).toBe(1);
  });

  it("تنبيه الغياب يُنشأ مرّةً لليوم", async () => {
    const { student } = await scaffold();
    expect(await notifyAbsence(student.id, "2026-05-05", prisma)).toBe(true);
    expect(await notifyAbsence(student.id, "2026-05-05", prisma)).toBe(false); // منع التكرار
    expect(await prisma.guardianMessage.count({ where: { kind: KIND_ABSENCE } })).toBe(1);
  });
});

describe("صندوق وليّ الأمر — لا يرى غيره", () => {
  it("الوليّ يرى رسائل طالبه فقط، وغيره لا يراها ولا يعلّمها مقروءة", async () => {
    const { guardian } = await scaffold();
    await generateWeeklyMessages(SUN, prisma);

    const inbox = await getGuardianInbox(guardian.id, prisma);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].read).toBe(false);

    // وليٌّ آخر لا علاقة له ← صندوقٌ فارغ.
    const other = await createUser(prisma, { roles: [Role.GUARDIAN] });
    expect(await getGuardianInbox(other.id, prisma)).toHaveLength(0);

    // الغريب لا يعلّمها مقروءة.
    await markMessageRead(inbox[0].id, other.id, prisma);
    expect((await prisma.guardianMessage.findUniqueOrThrow({ where: { id: inbox[0].id } })).readAt).toBeNull();

    // الوليّ صاحبها يعلّمها مقروءة.
    await markMessageRead(inbox[0].id, guardian.id, prisma);
    expect((await prisma.guardianMessage.findUniqueOrThrow({ where: { id: inbox[0].id } })).readAt).not.toBeNull();
  });
});

describe("weekStartSunday", () => {
  it("يعيد الأحد", () => {
    expect(weekStartSunday("2026-05-06").toISOString().slice(0, 10)).toBe("2026-05-03");
  });
});
