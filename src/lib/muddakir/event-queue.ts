// طابور أحداث الجهاز (§٨) — نقيّ فوق مخزنٍ محقون (IndexedDB في المتصفّح، ذاكرةٌ في الاختبار).
// كل ضغطةٍ تُحفظ محليًّا فورًا، وتُرسَل عند عودة الاتّصال/فتح التطبيق. الإرسال مرّةً واحدة: ما
// أُرسِل يُوسَم sent فلا يُعاد؛ وإن فشل الإرسال يبقى معلّقًا لإعادةٍ لاحقة. الخادم idempotent أيضًا.

import type { DeviceEventInput } from "./event-build";

export interface QueuedEvent extends DeviceEventInput {
  sent: boolean;
}

/** مخزنُ الطابور — واجهةٌ تُنفَّذ بـIndexedDB في المتصفّح. */
export interface QueueStore {
  add(e: QueuedEvent): Promise<void>;
  all(): Promise<QueuedEvent[]>;
  markSent(clientEventIds: string[]): Promise<void>;
}

export type Sender = (events: DeviceEventInput[]) => Promise<void>;

export class EventQueue {
  constructor(private store: QueueStore) {}

  /** يُضيف حدثًا (غير مُرسَلٍ بعد) ويُعيده. */
  async enqueue(e: DeviceEventInput): Promise<QueuedEvent> {
    const q: QueuedEvent = { ...e, sent: false };
    await this.store.add(q);
    return q;
  }

  /** كل الأحداث المحفوظة (مُرسَلةً كانت أو لا) — لإعادة بناء العدّادات بعد إعادة التحميل. */
  async all(): Promise<QueuedEvent[]> {
    return this.store.all();
  }

  /** المعلّقة (لم تُرسَل بعد). */
  async pending(): Promise<QueuedEvent[]> {
    return (await this.store.all()).filter((e) => !e.sent);
  }

  /**
   * يُرسل كل المعلّق **مرّةً واحدة**: ينجح ⟵ يوسمها sent فلا تُعاد؛ يفشل (send يرمي) ⟵ تبقى
   * معلّقةً لإعادةٍ لاحقة. يعيد عدد ما أُرسِل. استدعاؤه بلا معلّقٍ لا يفعل شيئًا.
   */
  async flush(send: Sender): Promise<number> {
    const pending = await this.pending();
    if (pending.length === 0) return 0;
    await send(pending.map(({ sent: _sent, ...e }) => e)); // eslint-disable-line @typescript-eslint/no-unused-vars
    await this.store.markSent(pending.map((e) => e.clientEventId));
    return pending.length;
  }
}

/** مخزنٌ في الذاكرة — للاختبار ولبيئةٍ بلا IndexedDB. */
export class MemoryQueueStore implements QueueStore {
  private items: QueuedEvent[] = [];
  async add(e: QueuedEvent): Promise<void> { this.items.push({ ...e }); }
  async all(): Promise<QueuedEvent[]> { return this.items.map((e) => ({ ...e })); }
  async markSent(ids: string[]): Promise<void> {
    const set = new Set(ids);
    for (const e of this.items) if (set.has(e.clientEventId)) e.sent = true;
  }
}
