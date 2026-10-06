// بناء أحداث الجهاز (§٨) — نقيّ: كل ضغطةٍ حدثٌ بـclientEventId (UUID من الجهاز) وoccurredAt
// (وقت الجهاز). مولّد المعرّف واللحظة مَحقونان ليُختبرا. الحدث نفسه يُطوى محليًّا للعرض الفوريّ،
// ويُرسَل عبر /api/muddakir/events (idempotent على clientEventId).

export interface DeviceEventInput {
  clientEventId: string;
  type: string;
  occurredAt: string; // ISO
  payload?: Record<string, unknown> | null;
}

export interface BuildDeps {
  uuid: () => string;
  now: () => Date;
}

/** الاعتماد الافتراضيّ في المتصفّح: crypto.randomUUID والوقت الحاليّ. */
export const browserDeps: BuildDeps = {
  uuid: () => crypto.randomUUID(),
  now: () => new Date(),
};

export function buildEvent(type: string, payload: Record<string, unknown> | null, deps: BuildDeps): DeviceEventInput {
  return { clientEventId: deps.uuid(), type, occurredAt: deps.now().toISOString(), payload: payload ?? null };
}

/** تحويل حدث جهازٍ إلى حدث طيٍّ نقيّ (للعدّادات المحليّة). */
export function toFoldEvent(e: DeviceEventInput): { type: string; occurredAtMs: number; page: number | null; reason: string | null; makeupForDate: string | null } {
  const p = e.payload ?? {};
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return { type: e.type, occurredAtMs: new Date(e.occurredAt).getTime(), page: num(p.page), reason: str(p.reason), makeupForDate: str(p.makeupForDate) };
}
