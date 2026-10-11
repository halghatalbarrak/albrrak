import { createHash } from "node:crypto";

import { type PrismaClient } from "@prisma/client";

// حدّ المعدّل للقراءة العامّة (ش٢): نافذةٌ ثابتة في القاعدة (أضبط من الذاكرة على serverless).
// المفتاح = sha256(token):ip — لا نصّ صريح. يمنع كشط الاستجابة بلا تعطيل التحديث الدوريّ العاديّ.

const WINDOW_MS = 60_000;
const LIMIT = 40; // طلبات/دقيقة لكل (شاشة، ip)

export async function withinRateLimit(token: string, ip: string, db: PrismaClient, now: Date): Promise<boolean> {
  const rkey = `${createHash("sha256").update(token).digest("hex")}:${ip}`;
  const windowStart = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
  const hit = await db.displayRateHit.upsert({
    where: { rkey_windowStart: { rkey, windowStart } },
    update: { count: { increment: 1 } },
    create: { rkey, windowStart, count: 1 },
    select: { count: true },
  });
  return hit.count <= LIMIT;
}
