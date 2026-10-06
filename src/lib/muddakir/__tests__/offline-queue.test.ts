import { describe, expect, it } from "vitest";

import { foldDay, type FoldEvent } from "../day-fold";
import { buildEvent, toFoldEvent, type BuildDeps } from "../event-build";
import { EventQueue, MemoryQueueStore } from "../event-queue";

const fe = (type: string, ms: number, extra: Partial<FoldEvent> = {}): FoldEvent => ({ type, occurredAtMs: ms, page: null, reason: null, makeupForDate: null, ...extra });

describe("day-fold — قاعدة «أخطأت» (§٤٫١)، محايدةٌ لترتيب الوصول", () => {
  it("خطأٌ ضمن الثلاث الأولى يصفّر؛ بعدها لا يُحسب؛ والتراجع يُنقص واحدًا", () => {
    // reps,reps,error(تصفير),reps,reps,reps ⟵ reps=3 repErrors=1
    const seq: FoldEvent[] = [
      fe("NEW_REP", 1, { page: 2 }), fe("NEW_REP", 2, { page: 2 }), fe("NEW_ERROR", 3, { page: 2 }),
      fe("NEW_REP", 4, { page: 2 }), fe("NEW_REP", 5, { page: 2 }), fe("NEW_REP", 6, { page: 2 }),
    ];
    const r1 = foldDay([...seq].reverse(), 3).faces.get(2); // وصولٌ معكوس
    expect(r1).toEqual({ reps: 3, repErrors: 1, yesterdayReps: 0 });

    // reps×3, error(لا تصفير), rep, undo ⟵ reps=3 repErrors=1
    const seq2: FoldEvent[] = [
      fe("NEW_REP", 1, { page: 5 }), fe("NEW_REP", 2, { page: 5 }), fe("NEW_REP", 3, { page: 5 }),
      fe("NEW_ERROR", 4, { page: 5 }), fe("NEW_REP", 5, { page: 5 }), fe("NEW_UNDO", 6, { page: 5 }),
    ];
    expect(foldDay(seq2, 3).faces.get(5)).toEqual({ reps: 3, repErrors: 1, yesterdayReps: 0 });
  });
});

describe("EventQueue — يُرسل مرّةً واحدة بعد الانقطاع", () => {
  it("flush يُرسل المعلّق مرّةً، والنداء الثاني لا يُرسل شيئًا؛ والفشل يُبقيه للإعادة", async () => {
    const store = new MemoryQueueStore();
    const q = new EventQueue(store);
    const deps: BuildDeps = { uuid: (() => { let i = 0; return () => `id${++i}`; })(), now: () => new Date("2026-05-10T08:00:00Z") };
    await q.enqueue(buildEvent("NEW_REP", { page: 1 }, deps));
    await q.enqueue(buildEvent("NEW_REP", { page: 1 }, deps));

    const sent: string[][] = [];
    const ok = async (evs: { clientEventId: string }[]) => { sent.push(evs.map((e) => e.clientEventId)); };
    expect(await q.flush(ok)).toBe(2);
    expect(await q.flush(ok)).toBe(0); // لا معلّق ⟵ لا إرسال ثانٍ
    expect(sent).toEqual([["id1", "id2"]]); // أُرسِلت مرّةً واحدة

    // حدثٌ جديدٌ بعد انقطاع، وإرسالٌ يفشل ثمّ ينجح ⟵ يُرسَل مرّةً فقط.
    await q.enqueue(buildEvent("DAY_COMPLETE", null, deps));
    await expect(q.flush(async () => { throw new Error("offline"); })).rejects.toThrow();
    expect((await q.pending()).length).toBe(1); // بقي معلّقًا
    expect(await q.flush(ok)).toBe(1);
    expect(sent).toEqual([["id1", "id2"], ["id3"]]);
  });
});

describe("إعادة التحميل بلا إنترنت تُبقي العدّادات", () => {
  it("العدّادات تُستعاد بطيّ الأحداث المحفوظة في المخزن (لا تُفقد)", async () => {
    const store = new MemoryQueueStore();
    const q = new EventQueue(store);
    const deps: BuildDeps = { uuid: (() => { let i = 0; return () => `e${++i}`; })(), now: (() => { let s = 0; return () => new Date(`2026-05-10T08:00:${String(s++).padStart(2, "0")}Z`); })() };
    for (let i = 0; i < 4; i++) await q.enqueue(buildEvent("NEW_REP", { page: 7 }, deps));
    await q.enqueue(buildEvent("NEW_ERROR", { page: 7 }, deps)); // بعد ٤ تكرارات (>٣) ⟵ لا تصفير

    // «إعادة تحميل»: طابورٌ جديدٌ فوق المخزن نفسه، يُعيد بناء العدّاد من المحفوظ.
    const reloaded = new EventQueue(store);
    const events = (await reloaded.all()).map(toFoldEvent);
    expect(foldDay(events, 3).faces.get(7)).toEqual({ reps: 4, repErrors: 1, yesterdayReps: 0 });
  });
});
