import type { Prisma, PrismaClient } from "@prisma/client";

// عميلٌ يقبل العميل الرئيس أو عميل المعاملة (transaction) — ليُستدعى داخل $transaction.
type Db = PrismaClient | Prisma.TransactionClient;

export interface EventInput {
  type: string;
  subjectType: string;
  subjectId: string;
  actorId?: string | null;
  payload?: Prisma.InputJsonValue;
}

// قاعدة العمل ٥: كل تغيير حالة يُصدِر حدثًا. سجلٌّ ملحق يستهلكه الاقتصاد لاحقًا.
export async function emitEvent(db: Db, input: EventInput) {
  return db.event.create({
    data: {
      type: input.type,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      actorId: input.actorId ?? null,
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
    },
  });
}
