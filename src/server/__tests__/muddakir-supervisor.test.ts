import { AutoEventType, PointGrantSource, ProgramKey, Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ingestEvents, type DeviceEvent } from "../muddakir-events";
import { enrollInMuddakir, assignSupervisor } from "../muddakir-enrollment";
import { applyDueTrackChange, latestTrackRequest, recomputeTreatmentAndWeak } from "../muddakir-day";
import {
  approveTrackChange,
  confirmWeekRegularity,
  markHeard,
  meetingWeek,
  recordSupervisorError,
  reverseWeekGrants,
  setReviewCycleDays,
  supervisorDashboard,
  supervisorHafizDetail,
} from "../muddakir-supervisor";
import { getBalance } from "../economy";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, createUser } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const NOW = new Date("2026-05-13T09:00:00.000Z"); // أربعاء — يوم اللقاء بتوقيت مكّة
const { weekStart } = meetingWeek(NOW, "WEDNESDAY"); // 2026-05-07 .. 2026-05-13
const MS_DAY = 86_400_000;
const dayPlus = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * MS_DAY).toISOString().slice(0, 10);
const at = (d: string, s = 0) => `${d}T08:00:${String(s).padStart(2, "0")}.000Z`; // داخل يوم مكّة d
const dval = (d: string) => new Date(`${d}T00:00:00.000Z`);
const ev = (clientEventId: string, type: string, occurredAt: string, payload?: Record<string, unknown>): DeviceEvent => ({ clientEventId, type, occurredAt, payload });

async function scaffold(settings: Record<string, unknown> = {}) {
  const mud = await createProgram(prisma, ProgramKey.MUDDAKIR);
  const def: Record<string, unknown> = {
    newReps: 5, firstCleanReps: 3, yesterdayReps: 10, ribatWindowDays: { "1": 20, "2": 15, "3": 10 },
    reviewCycleDays: 7, tracks: [1, 2, 3], treatmentLineReps: 3, treatmentCleanSessions: 2,
    weakFaceThreshold: null, meetingDay: "WEDNESDAY", maxHafizPerSupervisor: 4, monthlyExcuseLimit: null, ...settings,
  };
  await prisma.setting.createMany({ data: Object.entries(def).map(([key, value]) => ({ programId: mud.id, key, value: value as never })) });
  const other = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await createCircle(prisma, other.id);
  const { user, student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: other.id } });
  await enrollInMuddakir({ studentId: student.id, actorId: user.id });
  const supUser = await createUser(prisma, { roles: [Role.ARIF] });
  await assignSupervisor({ studentId: student.id, supervisorId: supUser.id, actorId: supUser.id }, prisma);
  return { mud, student, user, supUser };
}

/** بندٌ تلقائيٌّ (AUTO) مربوطٌ بحدثٍ — تعريف الإدارة لقيمة النقطة. */
async function autoItem(eventType: AutoEventType, value: number) {
  const item = await prisma.pointItem.create({ data: { nameAr: `بند-${eventType}`, value, grantSource: PointGrantSource.AUTO } });
  await prisma.autoGrantRule.create({ data: { pointItemId: item.id, eventType, active: true } });
  return item;
}

describe("تسميع الوجه (§٤٫٢/§٦)", () => {
  it("markHeard: IN_RIBAT → HEARD، وتجاوزُ النافذة بعدها ⟵ IN_REVIEW", async () => {
    const { student, supUser } = await scaffold();
    // وجهٌ قديمٌ (تجاوز نافذة المسار ١ = ٢٠ يومًا) في الربط.
    const old = dayPlus(weekStart, -30);
    await prisma.muddakirFace.create({ data: { studentId: student.id, page: 50, state: "IN_RIBAT", firstMemorizedOn: dval(old) } });
    const r = await markHeard({ actorUserId: supUser.id, studentId: student.id, page: 50 }, prisma, NOW);
    expect(r.heard).toBe(true);
    // سُمِع فتجاوز النافذة ⟵ IN_REVIEW (markHeard يشغّل transitionReviewStates).
    expect((await prisma.muddakirFace.findFirstOrThrow({ where: { studentId: student.id, page: 50 } })).state).toBe("IN_REVIEW");
  });

  it("وجهٌ حديثٌ يُسمَع فيبقى HEARD (لم يتجاوز النافذة)", async () => {
    const { student, supUser } = await scaffold();
    await prisma.muddakirFace.create({ data: { studentId: student.id, page: 51, state: "IN_RIBAT", firstMemorizedOn: dval(weekStart) } });
    await markHeard({ actorUserId: supUser.id, studentId: student.id, page: 51 }, prisma, NOW);
    expect((await prisma.muddakirFace.findFirstOrThrow({ where: { studentId: student.id, page: 51 } })).state).toBe("HEARD");
  });
});

describe("الصلاحيّة (§٦ بند ٦): المشرف لحفّاظه فقط", () => {
  it("مشرفٌ لا يصل لحافظ غيره: markHeard والتفصيل يُرفضان، واللوحة لا تُظهره", async () => {
    const { student, supUser } = await scaffold();
    const stranger = await createUser(prisma, { roles: [Role.ARIF] }); // مشرفٌ بلا إسناد لهذا الحافظ
    await expect(markHeard({ actorUserId: stranger.id, studentId: student.id, page: 1 }, prisma, NOW)).rejects.toThrow();
    await expect(supervisorHafizDetail(stranger.id, student.id, prisma, NOW)).rejects.toThrow();
    const dash = await supervisorDashboard(stranger.id, prisma, NOW);
    expect(dash.hafiz).toEqual([]);
    const mine = await supervisorDashboard(supUser.id, prisma, NOW);
    expect(mine.hafiz.map((h) => h.studentId)).toEqual([student.id]);
  });

  it("المدير يرى الجميع ويكتب لهم", async () => {
    const { student } = await scaffold();
    const manager = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER] });
    const dash = await supervisorDashboard(manager.id, prisma, NOW);
    expect(dash.canManageAll).toBe(true);
    expect(dash.hafiz.map((h) => h.studentId)).toContain(student.id);
    await prisma.muddakirFace.create({ data: { studentId: student.id, page: 5, state: "IN_RIBAT", firstMemorizedOn: dval(weekStart) } });
    expect((await markHeard({ actorUserId: manager.id, studentId: student.id, page: 5 }, prisma, NOW)).heard).toBe(true);
  });
});

describe("تسجيل موضع الخطأ بمصدر SUPERVISOR (§٤٫٤/§٦)", () => {
  it("يُنشئ موضعًا بمصدر المشرف، يرفض موضعًا خارج المصحف، وidempotent", async () => {
    const { student, supUser } = await scaffold();
    await prisma.mushafLine.create({ data: { page: 5, lineNo: 3, startSurah: 2, startAyah: 1, endSurah: 2, endAyah: 2 } });
    await recordSupervisorError({ actorUserId: supUser.id, studentId: student.id, page: 5, lineNo: 3 }, prisma, NOW);
    const errs = await prisma.muddakirError.findMany({ where: { studentId: student.id } });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ source: "SUPERVISOR", page: 5, lineNo: 3, recordedById: supUser.id });
    // موضعٌ غير موجودٍ في المصحف ⟵ يُرفض.
    await expect(recordSupervisorError({ actorUserId: supUser.id, studentId: student.id, page: 99, lineNo: 9 }, prisma, NOW)).rejects.toThrow();
    // idempotent: لا يكرّر الموضع المفتوح نفسه.
    await recordSupervisorError({ actorUserId: supUser.id, studentId: student.id, page: 5, lineNo: 3 }, prisma, NOW);
    expect(await prisma.muddakirError.count({ where: { studentId: student.id, resolvedAt: null } })).toBe(1);
  });
});

describe("تأكيد انتظام الأسبوع وإصدار النقاط (§٦ بند ٣، §٧)", () => {
  it("لا منح قبل التأكيد؛ وعنده تُصدَر دفعةً (أوجه مسموعة + أيّام متمّة − تقصير)، والتأكيد مرّتين لا يكرّر", async () => {
    const { student, supUser } = await scaffold();
    await autoItem(AutoEventType.MUDDAKIR_FACE_HEARD, 5);
    await autoItem(AutoEventType.MUDDAKIR_DAY_COMPLETE, 10);
    await autoItem(AutoEventType.MUDDAKIR_SHORTFALL, -7);
    // وجهان يُسمَعان هذا الأسبوع.
    for (const page of [50, 51]) await prisma.muddakirFace.create({ data: { studentId: student.id, page, state: "IN_RIBAT", firstMemorizedOn: dval(weekStart) } });
    await markHeard({ actorUserId: supUser.id, studentId: student.id, page: 50 }, prisma, NOW);
    await markHeard({ actorUserId: supUser.id, studentId: student.id, page: 51 }, prisma, NOW);
    // يومٌ متمٌّ (weekStart)؛ بقيّة الأيّام الماضية تقصير، ويوم اللقاء مفتوح.
    await ingestEvents({ actorUserId: student.userId, events: [ev("c0", "DAY_COMPLETE", at(weekStart))] }, prisma, NOW);

    expect(await getBalance(student.id, prisma)).toBe(0); // لا منح يوميّ قبل التأكيد

    // اليوم السابق مباشرةً (ضمن نافذة القضاء الآن) PENDING_MAKEUP لا تقصير؛ فأيّام التقصير أربعة.
    const r = await confirmWeekRegularity({ actorUserId: supUser.id, studentId: student.id }, prisma, NOW);
    expect(r).toMatchObject({ heardCount: 2, grantedDays: 1, shortfallDays: 4 });
    // ٢×٥ (أوجه) + ١×١٠ (يوم) + ٤×(−٧) (تقصير) = −٨
    expect(await getBalance(student.id, prisma)).toBe(-8);

    // التأكيد ثانيةً لا يكرّر المنح (قيد AutoGrant الفريد على sourceRef = الأسبوع + الحدث).
    await confirmWeekRegularity({ actorUserId: supUser.id, studentId: student.id }, prisma, NOW);
    expect(await getBalance(student.id, prisma)).toBe(-8);
    const week = await prisma.muddakirWeek.findFirstOrThrow({ where: { studentId: student.id } });
    expect(week.regularityConfirmedAt).not.toBeNull();
    expect(week.heardCount).toBe(2);
  });

  it("MADE_UP يُحسب مُتمًّا؛ وبند غير مُعرَّفٍ لا يمنح بلا خطأ", async () => {
    const { student } = await scaffold();
    await autoItem(AutoEventType.MUDDAKIR_DAY_COMPLETE, 10); // لا بند تقصيرٍ ولا أوجه
    const supUser = (await prisma.muddakirSupervision.findFirstOrThrow({ where: { studentId: student.id } })).supervisorId;
    const dMiss = dayPlus(weekStart, 1);
    const dMakeup = dayPlus(weekStart, 2);
    // dMiss لم يُتمّ، وقُضي في غده ضمن نافذته ⟵ MADE_UP.
    await ingestEvents({ actorUserId: student.userId, events: [ev("r", "NEW_REP", at(dMiss), { page: 1 })] }, prisma, NOW);
    await ingestEvents({ actorUserId: student.userId, events: [ev("m", "MAKEUP_COMPLETE", at(dMakeup), { makeupForDate: dMiss })] }, prisma, NOW);

    const r = await confirmWeekRegularity({ actorUserId: supUser, studentId: student.id }, prisma, NOW);
    expect(r.grantedDays).toBe(1); // اليوم المقضيّ وحده مُتمّ
    expect(await getBalance(student.id, prisma)).toBe(10); // التقصير بلا بندٍ ⟵ لا خصم ولا خطأ
  });

  it("بلا بنودٍ أصلاً: التأكيد لا يرمي والرصيد صفر", async () => {
    const { student, supUser } = await scaffold();
    await expect(confirmWeekRegularity({ actorUserId: supUser.id, studentId: student.id }, prisma, NOW)).resolves.toBeTruthy();
    expect(await getBalance(student.id, prisma)).toBe(0);
  });

  it("الحذف بالقيد المعاكس: reverseWeekGrants يعكس المنح ويُعيد الرصيد ويفكّ التأكيد", async () => {
    const { student, supUser } = await scaffold();
    await autoItem(AutoEventType.MUDDAKIR_DAY_COMPLETE, 10);
    await ingestEvents({ actorUserId: student.userId, events: [ev("c0", "DAY_COMPLETE", at(weekStart))] }, prisma, NOW);
    await confirmWeekRegularity({ actorUserId: supUser.id, studentId: student.id }, prisma, NOW);
    expect(await getBalance(student.id, prisma)).toBe(10);

    const rev = await reverseWeekGrants({ actorUserId: supUser.id, studentId: student.id }, prisma, NOW);
    expect(rev.reversed).toBe(1);
    expect(await getBalance(student.id, prisma)).toBe(0); // قيدٌ معاكسٌ (لا حذف)
    const grants = await prisma.autoGrant.findMany({ where: { studentId: student.id } });
    expect(grants.every((g) => g.reversedAt != null)).toBe(true);
    expect(await prisma.pointTransaction.count({ where: { studentId: student.id } })).toBe(2); // منحٌ + تعويض
    const week = await prisma.muddakirWeek.findFirstOrThrow({ where: { studentId: student.id } });
    expect(week.regularityConfirmedAt).toBeNull();
  });
});

describe("علاج الأخطاء — الجلسات المتتالية (§٤٫٤)", () => {
  it("جلساتٌ سليمةٌ متتاليةٌ تُغلق الموضع (treatmentCleanSessions=2)", async () => {
    const { student } = await scaffold({ treatmentLineReps: 3, treatmentCleanSessions: 2 });
    const d1 = dayPlus(weekStart, 0), d2 = dayPlus(weekStart, 1), d3 = dayPlus(weekStart, 2);
    const reps = (d: string, n: number) => Array.from({ length: n }, (_, i) => ev(`${d}-t${i}`, "TREATMENT_REP", at(d, i), { page: 10, lineNo: 5 }));
    await ingestEvents({ actorUserId: student.userId, events: [
      ev("eo", "ERROR_OPEN", at(d1), { page: 10, lineNo: 5, source: "RIBAT" }),
      ...reps(d2, 3), ...reps(d3, 3),
    ] }, prisma, NOW);
    const e = await prisma.muddakirError.findFirstOrThrow({ where: { studentId: student.id, page: 10, lineNo: 5 } });
    expect(e.cleanSessions).toBeGreaterThanOrEqual(2);
    expect(e.resolvedAt).not.toBeNull();
  });

  it("خطأٌ جديدٌ في الموضع يصفّر عدّاد الجلسات السليمة", async () => {
    const { student } = await scaffold({ treatmentLineReps: 3, treatmentCleanSessions: 2 });
    const d1 = dayPlus(weekStart, 0), d2 = dayPlus(weekStart, 1), d3 = dayPlus(weekStart, 2), d4 = dayPlus(weekStart, 3);
    const reps = (d: string, n: number) => Array.from({ length: n }, (_, i) => ev(`${d}-t${i}`, "TREATMENT_REP", at(d, i), { page: 10, lineNo: 5 }));
    await ingestEvents({ actorUserId: student.userId, events: [
      ev("eo", "ERROR_OPEN", at(d1), { page: 10, lineNo: 5, source: "RIBAT" }),
      ...reps(d2, 3),                                                   // جلسةٌ سليمةٌ (تتابع ١)
      ev("eo2", "ERROR_OPEN", at(d3), { page: 10, lineNo: 5, source: "RIBAT" }), // خطأٌ جديدٌ يصفّر
      ...reps(d4, 3),                                                   // جلسةٌ سليمةٌ (تتابع ١ من جديد)
    ] }, prisma, NOW);
    const e = await prisma.muddakirError.findFirstOrThrow({ where: { studentId: student.id, page: 10, lineNo: 5 } });
    expect(e.cleanSessions).toBe(1);
    expect(e.resolvedAt).toBeNull(); // لم يبلغ الجلستين المتتاليتين
  });
});

describe("وسم الأوجه الضعيفة (§٤٫٤)", () => {
  it("يُوسم الوجه عند بلوغ أخطائه العتبة إن ضُبطت", async () => {
    const { student } = await scaffold({ weakFaceThreshold: 2 });
    await prisma.muddakirFace.create({ data: { studentId: student.id, page: 100, state: "IN_RIBAT", repErrors: 3 } });
    await prisma.muddakirFace.create({ data: { studentId: student.id, page: 101, state: "IN_RIBAT", repErrors: 1 } });
    await recomputeTreatmentAndWeak(prisma, student.id);
    expect((await prisma.muddakirFace.findFirstOrThrow({ where: { studentId: student.id, page: 100 } })).weak).toBe(true);
    expect((await prisma.muddakirFace.findFirstOrThrow({ where: { studentId: student.id, page: 101 } })).weak).toBe(false);
  });

  it("لا وسمَ إن كانت العتبة null ولو كثرت الأخطاء", async () => {
    const { student } = await scaffold(); // weakFaceThreshold = null
    await prisma.muddakirFace.create({ data: { studentId: student.id, page: 100, state: "IN_RIBAT", repErrors: 9 } });
    await recomputeTreatmentAndWeak(prisma, student.id);
    expect((await prisma.muddakirFace.findFirstOrThrow({ where: { studentId: student.id, page: 100 } })).weak).toBe(false);
  });
});

describe("تغيير المسار ودورة المراجعة (§٤٫١/§٤٫٣/§٦)", () => {
  it("طلب الحافظ يظهر للمشرف، والإقرار يضبط pendingTrack + الغد، ويُطبَّق من يومه", async () => {
    const { student, supUser } = await scaffold();
    // الحافظ يطلب المسار ٢ من صفحته (حدثٌ).
    await ingestEvents({ actorUserId: student.userId, events: [ev("req", "TRACK_CHANGE_REQUEST", at(weekStart), { track: 2 })] }, prisma, NOW);
    expect((await latestTrackRequest(prisma, student.id))?.track).toBe(2);
    const detail = await supervisorHafizDetail(supUser.id, student.id, prisma, NOW);
    expect(detail.trackRequest).toEqual({ track: 2 });

    const res = await approveTrackChange({ actorUserId: supUser.id, studentId: student.id }, prisma, NOW);
    const tomorrow = dayPlus("2026-05-13", 1);
    expect(res).toMatchObject({ pendingTrack: 2, effectiveFrom: tomorrow });
    let p = await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } });
    expect(p.track).toBe(1); // لم يحن موعده بعد

    await applyDueTrackChange(prisma, student.id, "2026-05-13"); // اليوم قبل الموعد ⟵ لا تغيير
    p = await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } });
    expect(p.track).toBe(1);

    await applyDueTrackChange(prisma, student.id, tomorrow); // حلّ الموعد ⟵ يُطبَّق
    p = await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } });
    expect(p).toMatchObject({ track: 2, pendingTrack: null, effectiveFrom: null });
  });

  it("إقرارٌ بمسارٍ غير مسموحٍ يُرفض", async () => {
    const { student, supUser } = await scaffold({ tracks: [1, 2, 3] });
    await expect(approveTrackChange({ actorUserId: supUser.id, studentId: student.id, track: 9 }, prisma, NOW)).rejects.toThrow();
  });

  it("المشرف يعدّل دورة المراجعة لحافظه", async () => {
    const { student, supUser } = await scaffold();
    await setReviewCycleDays({ actorUserId: supUser.id, studentId: student.id, days: 10 }, prisma);
    expect((await prisma.muddakirProfile.findUniqueOrThrow({ where: { studentId: student.id } })).reviewCycleDays).toBe(10);
    await expect(setReviewCycleDays({ actorUserId: supUser.id, studentId: student.id, days: 0 }, prisma)).rejects.toThrow();
  });
});
