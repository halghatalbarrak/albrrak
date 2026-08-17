import {
  Role,
  StudentState,
  ApprovalKind,
  ApprovalStatus,
  ApplicationStatus,
  Gender,
  ProgramKey,
} from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getSummary } from "../summary";
import { prisma, resetDb } from "../testing/helpers";
import {
  createUser,
  createStudent,
  createProgram,
  createCircle,
  createNationality,
  createGuardianRelation,
} from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function pendingApplication() {
  const nat = await createNationality(prisma);
  const rel = await createGuardianRelation(prisma);
  return prisma.application.create({
    data: {
      nameAsInId: "خالد", nationalIdEnc: "enc", nationalityId: nat.id,
      birthDate: new Date("2010-01-01"), gender: Gender.MALE,
      guardianPhone: "0555000001", guardianGender: Gender.MALE, guardianRelationId: rel.id,
      emergencyName: "طوارئ", emergencyPhone: "0555000009", emergencyRelationId: rel.id,
      status: ApplicationStatus.PENDING,
    },
  });
}

async function pendingApproval() {
  return prisma.approval.create({
    data: { kind: ApprovalKind.STAGE_TRANSITION, subjectType: "Student", subjectId: "x", proposedBy: "y", status: ApprovalStatus.PENDING },
  });
}

describe("getSummary — ملخّصٌ حسب الدور، يقترح الخطوة التالية", () => {
  it("المدير: بطاقاتٌ خمس، والخطوة التالية تُقدِّم الطلبات المعلّقة", async () => {
    const mgr = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const { student } = await createStudent(prisma);
    await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
    const program = await createProgram(prisma, ProgramKey.MARAQI);
    await createCircle(prisma, program.id);
    await pendingApplication();
    await pendingApproval();

    const s = await getSummary({ id: mgr.id, roles: [Role.CIRCLE_MANAGER] }, prisma);
    expect(s.scope).toBe("manager");
    expect(s.cards).toHaveLength(5);
    // الأولويّة للطلبات على الاعتمادات (كلاهما معلّق)
    expect(s.nextStep.href).toBe("/admin/applications");
    expect(s.nextStep.cta).toBe("راجِع الطلبات");
  });

  it("المدير بلا معلّقات: الخطوة التالية إيجابيّةٌ لا فارغة", async () => {
    const mgr = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    const s = await getSummary({ id: mgr.id, roles: [Role.SUPER_ADMIN] }, prisma);
    expect(s.scope).toBe("manager");
    expect(s.nextStep.tone).toBe("success");
    expect(s.nextStep.title).toContain("لا إجراء");
  });

  it("المعلّم بلا حلقةٍ مُسنَدة: يُرشَد لا يُترك بشاشةٍ فارغة", async () => {
    const t = await createUser(prisma, { roles: [Role.TEACHER] });
    const s = await getSummary({ id: t.id, roles: [Role.TEACHER] }, prisma);
    expect(s.scope).toBe("teacher");
    expect(s.nextStep.href).toBe("/admin/circles");
  });

  it("المُسمِّع: لا جاهزين ← خطوةٌ إيجابيّةٌ تفتح الحصاد", async () => {
    const r = await createUser(prisma, { roles: [Role.RECITER] });
    const s = await getSummary({ id: r.id, roles: [Role.RECITER] }, prisma);
    expect(s.scope).toBe("reciter");
    expect(s.nextStep.href).toBe("/admin/hasad");
  });

  it("الطالب في المراقي: الخطوة التالية تفتح مراقي", async () => {
    const { user, student } = await createStudent(prisma);
    await prisma.student.update({ where: { id: student.id }, data: { state: StudentState.IN_MARAQI } });
    const s = await getSummary({ id: user.id, roles: [Role.STUDENT] }, prisma);
    expect(s.scope).toBe("student");
    expect(s.nextStep.href).toBe("/programs/maraqi");
  });
});
