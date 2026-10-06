import { ProgramKey } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ingestEvents, type DeviceEvent } from "../muddakir-events";
import {
  computeDayStatus,
  getDayStatus,
  markFaceHeard,
  todayPlan,
  transitionReviewStates,
  loadDayEngineSettings,
} from "../muddakir-day";
import { enrollInMuddakir } from "../muddakir-enrollment";
import { prisma, resetDb } from "../testing/helpers";
import { createCircle, createProgram, createStudent, seedMushafFaces } from "../testing/factories";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const MS_DAY = 86_400_000;
const dayPlus = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * MS_DAY).toISOString().slice(0, 10);
const at = (d: string, s = 0) => `${d}T08:00:${String(s).padStart(2, "0")}.000Z`; // داخل يوم مكّة d
const beforeMidnight = (d: string) => `${d}T20:59:00.000Z`; // ٢٣:٥٩ بمكّة — آخر اليوم
const nowInDay = (d: string) => new Date(`${d}T12:00:00.000Z`);
const nowAfterMidnight = (d: string) => new Date(`${dayPlus(d, 1)}T06:00:00.000Z`); // ضمن نافذة القضاء
const nowAfterNextMidnight = (d: string) => new Date(`${dayPlus(d, 2)}T06:00:00.000Z`); // بعد نافذة القضاء

const D = "2026-05-10";

async function scaffold(settings: Record<string, unknown> = {}) {
  const mud = await createProgram(prisma, ProgramKey.MUDDAKIR);
  const def: Record<string, unknown> = { newReps: 5, firstCleanReps: 3, yesterdayReps: 10, ribatWindowDays: { "1": 20, "2": 15, "3": 10 }, reviewCycleDays: 7, tracks: [1, 2, 3], ...settings };
  await prisma.setting.createMany({ data: Object.entries(def).map(([key, value]) => ({ programId: mud.id, key, value: value as never })) });
  const other = await createProgram(prisma, ProgramKey.MARAQI);
  const circle = await createCircle(prisma, other.id);
  const { user, student } = await createStudent(prisma);
  await prisma.enrollment.create({ data: { studentId: student.id, circleId: circle.id, programId: other.id } });
  await enrollInMuddakir({ studentId: student.id, actorId: user.id });
  return { mud, student, user };
}

const ev = (clientEventId: string, type: string, occurredAt: string, payload?: Record<string, unknown>): DeviceEvent => ({ clientEventId, type, occurredAt, payload });

describe("ingestEvents — idempotent على clientEventId", () => {
  it("الحدث المكرّر يُتجاهل بلا خطأ", async () => {
    const { student, user } = await scaffold();
    const events = [ev("e1", "NEW_REP", at(D, 1), { page: 1 }), ev("e2", "NEW_REP", at(D, 2), { page: 1 })];
    const r1 = await ingestEvents({ actorUserId: user.id, events }, prisma, nowInDay(D));
    expect(r1).toMatchObject({ accepted: 2, duplicates: 0 });
    const r2 = await ingestEvents({ actorUserId: user.id, events: [events[0], ev("e3", "NEW_REP", at(D, 3), { page: 1 })] }, prisma, nowInDay(D));
    expect(r2).toMatchObject({ accepted: 1, duplicates: 1 });
    expect(await prisma.muddakirEvent.count({ where: { studentId: student.id } })).toBe(3);
  });

  it("يرفض من ليس صاحب الحافظ، وحدثًا لا يخصّه", async () => {
    const { student, user } = await scaffold();
    const other = await createStudent(prisma);
    await expect(ingestEvents({ actorUserId: other.user.id, events: [ev("x", "NEW_REP", at(D), { page: 1 })] })).rejects.toThrow();
    await expect(ingestEvents({ actorUserId: user.id, events: [{ ...ev("y", "NEW_REP", at(D), { page: 1 }), studentId: "someone-else" }] })).rejects.toThrow();
    expect(student.id).toBeTruthy();
  });
});

describe("اشتقاق DayFace — التكرار وقاعدة الثلاث الأولى (محايدٌ لترتيب الوصول)", () => {
  it("أحداثٌ بترتيبٍ معكوسٍ تُعطي النتيجة نفسها (خطأٌ ضمن الأولى يُصفّر)", async () => {
    const { student, user } = await scaffold(); // newReps=5, firstCleanReps=3
    // ترتيب occurredAt الحقيقيّ: rep,rep,error(تصفير),rep,rep,rep ⟵ reps=3, repErrors=1
    const seq = [
      ev("a", "NEW_REP", at(D, 1), { page: 2 }), ev("b", "NEW_REP", at(D, 2), { page: 2 }),
      ev("c", "NEW_ERROR", at(D, 3), { page: 2 }), ev("d", "NEW_REP", at(D, 4), { page: 2 }),
      ev("e", "NEW_REP", at(D, 5), { page: 2 }), ev("f", "NEW_REP", at(D, 6), { page: 2 }),
    ];
    await ingestEvents({ actorUserId: user.id, events: [...seq].reverse() }, prisma, nowInDay(D)); // وصولٌ معكوس
    const day = await prisma.muddakirDay.findFirstOrThrow({ where: { studentId: student.id } });
    const face = await prisma.muddakirDayFace.findFirstOrThrow({ where: { dayId: day.id, page: 2 } });
    expect(face).toMatchObject({ reps: 3, repErrors: 1 });
  });

  it("خطأٌ بعد الثلاث الأولى لا يُصفّر، والتراجع يُنقص واحدًا", async () => {
    const { student, user } = await scaffold();
    const seq = [
      ev("a", "NEW_REP", at(D, 1), { page: 3 }), ev("b", "NEW_REP", at(D, 2), { page: 3 }), ev("c", "NEW_REP", at(D, 3), { page: 3 }),
      ev("d", "NEW_ERROR", at(D, 4), { page: 3 }), ev("e", "NEW_REP", at(D, 5), { page: 3 }), ev("f", "NEW_UNDO", at(D, 6), { page: 3 }),
    ];
    await ingestEvents({ actorUserId: user.id, events: seq }, prisma, nowInDay(D));
    const day = await prisma.muddakirDay.findFirstOrThrow({ where: { studentId: student.id } });
    const face = await prisma.muddakirDayFace.findFirstOrThrow({ where: { dayId: day.id, page: 3 } });
    expect(face).toMatchObject({ reps: 3, repErrors: 1 }); // ٣ سلمت، خطأٌ لم يصفّر، تكرارٌ ثمّ تراجع
  });
});

describe("حالة اليوم بتوقيت مكّة (كسولٌ عند القراءة)", () => {
  it("الإتمام المضغوط قبل منتصف الليل يُقبل ولو وصل بعده (occurredAt)", async () => {
    const { student, user } = await scaffold();
    // ضُغط ٢٣:٥٩ بمكّة، لكنّ الاستقبال/الآن بعد منتصف الليل.
    await ingestEvents({ actorUserId: user.id, events: [ev("c", "DAY_COMPLETE", beforeMidnight(D))] }, prisma, nowAfterMidnight(D));
    const day = await prisma.muddakirDay.findFirstOrThrow({ where: { studentId: student.id } });
    expect(day.status).toBe("COMPLETE");
    expect(await getDayStatus(prisma, student.id, D, nowAfterMidnight(D))).toBe("COMPLETE");
  });

  it("OPEN قبل منتصف الليل، PENDING_MAKEUP بعده، SHORTFALL بعد منتصف ليل الغد", async () => {
    const { student, user } = await scaffold();
    await ingestEvents({ actorUserId: user.id, events: [ev("r", "NEW_REP", at(D, 1), { page: 1 })] }, prisma, nowInDay(D));
    expect(await getDayStatus(prisma, student.id, D, nowInDay(D))).toBe("OPEN");
    expect(await getDayStatus(prisma, student.id, D, nowAfterMidnight(D))).toBe("PENDING_MAKEUP");
    expect(await getDayStatus(prisma, student.id, D, nowAfterNextMidnight(D))).toBe("SHORTFALL");
  });
});

describe("القضاء (§٥)", () => {
  it("قضاءٌ ناجح: اليوم المفقود ⟵ MADE_UP مع makeupForDayId", async () => {
    const { student, user } = await scaffold();
    const next = dayPlus(D, 1);
    // D لم يُتمّ. في الغد: حدثُ قضاءٍ لـD ضمن نافذته.
    await ingestEvents({ actorUserId: user.id, events: [ev("r", "NEW_REP", at(D, 1), { page: 1 })] }, prisma, nowInDay(D));
    await ingestEvents({ actorUserId: user.id, events: [ev("m", "MAKEUP_COMPLETE", at(next, 1), { makeupForDate: D })] }, prisma, nowInDay(next));
    const dRow = await prisma.muddakirDay.findFirstOrThrow({ where: { studentId: student.id, dayDate: new Date(`${D}T00:00:00Z`) } });
    expect(dRow.status).toBe("MADE_UP");
    expect(dRow.makeupForDayId).toBeTruthy();
    expect(await getDayStatus(prisma, student.id, D, nowInDay(next))).toBe("MADE_UP");
  });

  it("قضاءٌ فاشل: لا قضاء ⟵ SHORTFALL بعد نافذته", async () => {
    const { student, user } = await scaffold();
    await ingestEvents({ actorUserId: user.id, events: [ev("r", "NEW_REP", at(D, 1), { page: 1 })] }, prisma, nowInDay(D));
    expect(await getDayStatus(prisma, student.id, D, nowAfterNextMidnight(D))).toBe("SHORTFALL");
  });
});

describe("العذر (§٥)", () => {
  it("يوم العذر EXCUSED بلا قضاءٍ ولا تقصير، ويوقف الجديد في الخطّة", async () => {
    const { student, user } = await scaffold();
    await seedMushafFaces(prisma);
    await ingestEvents({ actorUserId: user.id, events: [ev("x", "EXCUSE", at(D, 1), { reason: "ILLNESS" })] }, prisma, nowInDay(D));
    // حتى بعد منتصف ليل الغد يبقى EXCUSED (لا SHORTFALL).
    expect(await getDayStatus(prisma, student.id, D, nowAfterNextMidnight(D))).toBe("EXCUSED");
    const plan = await todayPlan(student.id, D, prisma, nowInDay(D));
    expect(plan.excused).toBe(true);
    expect(plan.newFaces).toEqual([]); // الجديد موقوف
  });
});

describe("حالات الأوجه (§٤٫٢)", () => {
  it("NEW ⟵ IN_RIBAT بعد بلوغ التكرار", async () => {
    const { student, user } = await scaffold(); // newReps=5
    const reps = Array.from({ length: 5 }, (_, i) => ev(`r${i}`, "NEW_REP", at(D, i + 1), { page: 1 }));
    await ingestEvents({ actorUserId: user.id, events: reps }, prisma, nowInDay(D));
    const face = await prisma.muddakirFace.findFirstOrThrow({ where: { studentId: student.id, page: 1 } });
    expect(face.state).toBe("IN_RIBAT");
    expect(face.firstMemorizedOn?.toISOString().slice(0, 10)).toBe(D);
  });

  it("الوجه لا يخرج من الربط إلى المراجعة قبل HEARD، وبعده يخرج بتجاوز النافذة", async () => {
    const { student, user } = await scaffold(); // المسار ١، نافذة ٢٠
    const old = dayPlus(D, -25);
    await prisma.muddakirFace.create({ data: { studentId: student.id, page: 50, state: "IN_RIBAT", firstMemorizedOn: new Date(`${old}T00:00:00Z`) } });
    const settings = await loadDayEngineSettings(prisma);

    // تجاوز النافذة لكنّه لم يُسمَع ⟵ يبقى IN_RIBAT.
    await transitionReviewStates(prisma, student.id, D, 1, settings);
    expect((await prisma.muddakirFace.findFirstOrThrow({ where: { studentId: student.id, page: 50 } })).state).toBe("IN_RIBAT");

    // يسمّعه المشرف ⟵ HEARD، ثمّ يتجاوز النافذة ⟵ IN_REVIEW.
    expect(await markFaceHeard(prisma, student.id, 50, user.id)).toBe(true);
    expect((await prisma.muddakirFace.findFirstOrThrow({ where: { studentId: student.id, page: 50 } })).state).toBe("HEARD");
    await transitionReviewStates(prisma, student.id, D, 1, settings);
    expect((await prisma.muddakirFace.findFirstOrThrow({ where: { studentId: student.id, page: 50 } })).state).toBe("IN_REVIEW");
  });
});

describe("todayPlan — يركّب دوالّ src/lib/muddakir", () => {
  it("يُرجع الجديد بحسب المسار وتكرار الأمس وقضاء الأمس إن وُجد", async () => {
    const { student, user } = await scaffold(); // المسار ١
    await seedMushafFaces(prisma);
    const y = dayPlus(D, -1);
    // أمس: حُفظ الوجه ١ (فيصبح تكرار الأمس اليوم)، ولم يُتمّ (قضاءٌ معلّق).
    await prisma.muddakirFace.create({ data: { studentId: student.id, page: 1, state: "IN_RIBAT", firstMemorizedOn: new Date(`${y}T00:00:00Z`) } });
    await ingestEvents({ actorUserId: user.id, events: [ev("yr", "NEW_REP", at(y, 1), { page: 1 })] }, prisma, nowInDay(y));

    const plan = await todayPlan(student.id, D, prisma, nowInDay(D));
    expect(plan.yesterday).toEqual([1]);           // تكرار الأمس
    expect(plan.newFaces).toEqual([2]);            // الجديد = الوجه التالي (المسار ١)
    expect(plan.makeup?.forDate).toBe(y);          // أمسُ معلّقٌ للقضاء
    expect(Array.isArray(plan.ribat)).toBe(true);
    expect(Array.isArray(plan.reviewSlice)).toBe(true);
  });
});

describe("computeDayStatus — دالّةٌ نقيّة", () => {
  const base = { dayDate: D, isMakeup: false, madeUpOn: null } as const;
  it("الأولويّات: إتمام ← عذر ← زمنيّ", () => {
    expect(computeDayStatus({ ...base, completedAt: new Date(beforeMidnight(D)), excused: false, now: nowAfterMidnight(D) })).toBe("COMPLETE");
    expect(computeDayStatus({ ...base, completedAt: null, excused: true, now: nowAfterNextMidnight(D) })).toBe("EXCUSED");
    expect(computeDayStatus({ ...base, completedAt: null, excused: false, now: nowInDay(D) })).toBe("OPEN");
    expect(computeDayStatus({ ...base, completedAt: null, excused: false, now: nowAfterMidnight(D) })).toBe("PENDING_MAKEUP");
    expect(computeDayStatus({ ...base, completedAt: null, excused: false, now: nowAfterNextMidnight(D) })).toBe("SHORTFALL");
    expect(computeDayStatus({ ...base, completedAt: new Date(beforeMidnight(D)), excused: false, isMakeup: true, now: nowInDay(D) })).toBe("MADE_UP");
  });
});
