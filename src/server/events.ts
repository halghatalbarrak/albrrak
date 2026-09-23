import type { Prisma, PrismaClient } from "@prisma/client";

import { currentImpersonatorId } from "./request-context";

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
// توثيقٌ مزدوجٌ للانتحال (الضمان ٢): إن كان الطلب أثناء انتحال، يُختَم الحدث بالفاعل
// الحقيقيّ (impersonatorId) تلقائيًّا من سياق الطلب — بلا لمس مواضع النداء. فلا يضيع أثر.
export async function emitEvent(db: Db, input: EventInput) {
  const impersonatorId = currentImpersonatorId();
  return db.event.create({
    data: {
      type: input.type,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      actorId: input.actorId ?? null,
      ...(impersonatorId ? { impersonatorId } : {}),
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
    },
  });
}
