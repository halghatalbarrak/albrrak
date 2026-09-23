import { Role } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { requireAuth, type Actor } from "../auth";
import { emitEvent } from "../events";
import {
  assertCanImpersonate, startImpersonation, stopImpersonation,
  signImpersonation, verifyImpersonation, parseImpCookie, IMPERSONATION_COOKIE,
} from "../impersonation";
import { AuthorizationError, ValidationError } from "../errors";
import { prisma, resetDb } from "../testing/helpers";
import { createUser } from "../testing/factories";
import { mintJwt } from "../testing/auth";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const nowSec = () => Math.floor(Date.now() / 1000);
const actorOf = (id: string, roles: Role[], impersonating = false): Actor =>
  ({ id, roles, realActorId: id, impersonating });

// طلبٌ حقيقيٌّ: JWT في الترويسة (كالمتصفّح) + كوكي الانتحال (تُرسَل تلقائيًّا).
async function reqFor(authId: string, cookie?: string): Promise<Request> {
  const jwt = await mintJwt(authId);
  const headers: Record<string, string> = { authorization: `Bearer ${jwt}` };
  if (cookie) headers.cookie = `${IMPERSONATION_COOKIE}=${cookie}`;
  return new Request("http://localhost/api/x", { headers });
}

// ═══════════════ توقيع الكوكي — لا تزوير من المتصفّح ═══════════════
describe("كوكي الانتحال الموقّعة", () => {
  it("توقيعٌ صحيحٌ ⟵ يُقبل، وتلاعبٌ ⟵ يُرفض", () => {
    const signed = signImpersonation({ act: "tech", imp: "teacher", iat: nowSec() });
    expect(verifyImpersonation(signed)).toMatchObject({ act: "tech", imp: "teacher" });
    // تلاعبٌ في الجسم (تبديل المنتحَل) يُبطل التوقيع.
    const tampered = signed.replace(/^[^.]+/, Buffer.from(JSON.stringify({ act: "tech", imp: "victim", iat: nowSec() })).toString("base64url"));
    expect(verifyImpersonation(tampered)).toBeNull();
  });

  it("كوكي منتهية (iat قديم) ⟵ تُرفض", () => {
    const old = signImpersonation({ act: "tech", imp: "teacher", iat: nowSec() - 999999 });
    expect(verifyImpersonation(old)).toBeNull();
  });

  it("parseImpCookie يستخرج القيمة من ترويسة Cookie", () => {
    expect(parseImpCookie(`foo=1; ${IMPERSONATION_COOKIE}=abc.def; bar=2`)).toBe("abc.def");
    expect(parseImpCookie(null)).toBeNull();
  });
});

// ═══════════════ الحُرّاس الصارمة (تُثبت الرفض) ═══════════════
describe("حُرّاس بدء الانتحال", () => {
  it("TECH_ADMIN فقط — غيره يُرفض", async () => {
    const target = await createUser(prisma, { roles: [Role.TEACHER] });
    const superAdmin = await createUser(prisma, { roles: [Role.SUPER_ADMIN] });
    await expect(assertCanImpersonate(actorOf(superAdmin.id, [Role.SUPER_ADMIN]), target.id, prisma))
      .rejects.toBeInstanceOf(AuthorizationError);
  });

  it("لا يُنتحَل مديرٌ تقنيّ آخر — يُرفض", async () => {
    const tech = await createUser(prisma, { roles: [Role.TECH_ADMIN] });
    const otherTech = await createUser(prisma, { roles: [Role.TECH_ADMIN, Role.TEACHER] });
    await expect(assertCanImpersonate(actorOf(tech.id, [Role.TECH_ADMIN]), otherTech.id, prisma))
      .rejects.toBeInstanceOf(AuthorizationError);
  });

  it("لا تسلسل — منتحَلٌ لا يبدأ انتحالًا (يُفحَص الفاعل الحقيقيّ)", async () => {
    const tech = await createUser(prisma, { roles: [Role.TECH_ADMIN] });
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    const target = await createUser(prisma, { roles: [Role.STUDENT] });
    // فاعلٌ يبدو معلّمًا (أدواره الفعليّة) لكنّه أثناء انتحال ⟵ يُرفض بدء انتحالٍ جديد.
    const midImp: Actor = { id: teacher.id, roles: [Role.TEACHER], realActorId: tech.id, impersonating: true };
    await expect(assertCanImpersonate(midImp, target.id, prisma))
      .rejects.toBeInstanceOf(AuthorizationError);
  });

  it("لا انتحال النفس — يُرفض", async () => {
    const tech = await createUser(prisma, { roles: [Role.TECH_ADMIN] });
    await expect(assertCanImpersonate(actorOf(tech.id, [Role.TECH_ADMIN]), tech.id, prisma))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it("هدفٌ معطَّلٌ/غير موجود — يُرفض", async () => {
    const tech = await createUser(prisma, { roles: [Role.TECH_ADMIN] });
    const off = await createUser(prisma, { roles: [Role.TEACHER], isActive: false });
    await expect(assertCanImpersonate(actorOf(tech.id, [Role.TECH_ADMIN]), off.id, prisma))
      .rejects.toBeInstanceOf(ValidationError);
    await expect(assertCanImpersonate(actorOf(tech.id, [Role.TECH_ADMIN]), "لا-أحد", prisma))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it("نجاحٌ ⟵ يوثّق IMPERSONATION_STARTED بالفاعل الحقيقيّ", async () => {
    const tech = await createUser(prisma, { roles: [Role.TECH_ADMIN] });
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    const payload = await startImpersonation(actorOf(tech.id, [Role.TECH_ADMIN]), teacher.id, prisma);
    expect(payload).toMatchObject({ act: tech.id, imp: teacher.id });
    const ev = await prisma.event.findFirstOrThrow({ where: { type: "IMPERSONATION_STARTED" } });
    expect(ev.actorId).toBe(tech.id); // الفاعل الحقيقيّ
    expect(ev.subjectId).toBe(teacher.id); // المنتحَل
  });
});

// ═══════════════ حلّ الهويّة في requireAuth (JWT + كوكي) ═══════════════
describe("requireAuth يحلّ الانتحال بأمان", () => {
  it("TECH_ADMIN بكوكي صحيحة لمعلّم ⟵ الهويّة الفعليّة = المعلّم، والفاعل الحقيقيّ محفوظ", async () => {
    const tech = await createUser(prisma, { roles: [Role.TECH_ADMIN], authId: "auth-tech" });
    const teacher = await createUser(prisma, { roles: [Role.TEACHER], authId: "auth-teacher" });
    const cookie = signImpersonation({ act: tech.id, imp: teacher.id, iat: nowSec() });
    const actor = await requireAuth(await reqFor("auth-tech", cookie), prisma);
    expect(actor).toMatchObject({ id: teacher.id, roles: [Role.TEACHER], realActorId: tech.id, impersonating: true });
  });

  it("كوكي مربوطةٌ بفاعلٍ آخر (act ≠ الداخل) ⟵ تُهمَل", async () => {
    const tech = await createUser(prisma, { roles: [Role.TECH_ADMIN], authId: "auth-tech" });
    const teacher = await createUser(prisma, { roles: [Role.TEACHER], authId: "auth-teacher" });
    const cookie = signImpersonation({ act: "someone-else", imp: teacher.id, iat: nowSec() });
    const actor = await requireAuth(await reqFor("auth-tech", cookie), prisma);
    expect(actor).toMatchObject({ id: tech.id, impersonating: false });
  });

  it("فاعلٌ ليس TECH_ADMIN ومعه كوكي ⟵ تُهمَل (يعمل بهويّته)", async () => {
    const mgr = await createUser(prisma, { roles: [Role.CIRCLE_MANAGER], authId: "auth-mgr" });
    const teacher = await createUser(prisma, { roles: [Role.TEACHER], authId: "auth-teacher" });
    const cookie = signImpersonation({ act: mgr.id, imp: teacher.id, iat: nowSec() });
    const actor = await requireAuth(await reqFor("auth-mgr", cookie), prisma);
    expect(actor).toMatchObject({ id: mgr.id, impersonating: false });
  });

  it("الهدف TECH_ADMIN ⟵ يُهمَل الانتحال (دفاعٌ عميق)", async () => {
    const tech = await createUser(prisma, { roles: [Role.TECH_ADMIN], authId: "auth-tech" });
    const tech2 = await createUser(prisma, { roles: [Role.TECH_ADMIN], authId: "auth-tech2" });
    const cookie = signImpersonation({ act: tech.id, imp: tech2.id, iat: nowSec() });
    const actor = await requireAuth(await reqFor("auth-tech", cookie), prisma);
    expect(actor).toMatchObject({ id: tech.id, impersonating: false });
  });

  it("كوكي مزوّرة ⟵ تُهمَل", async () => {
    const tech = await createUser(prisma, { roles: [Role.TECH_ADMIN], authId: "auth-tech" });
    const teacher = await createUser(prisma, { roles: [Role.TEACHER], authId: "auth-teacher" });
    const forged = `${Buffer.from(JSON.stringify({ act: tech.id, imp: teacher.id, iat: nowSec() })).toString("base64url")}.ZZZZ`;
    const actor = await requireAuth(await reqFor("auth-tech", forged), prisma);
    expect(actor).toMatchObject({ id: tech.id, impersonating: false });
  });
});

// ═══════════════ التوثيق المزدوج (الضمان ٢) — الأثر لا يضيع ═══════════════
describe("توثيقٌ مزدوجٌ لكلّ فعلٍ أثناء الانتحال", () => {
  it("بعد requireAuth (انتحال)، كلّ حدثٍ يُختَم بالفاعل الحقيقيّ + الفعليّ", async () => {
    const tech = await createUser(prisma, { roles: [Role.TECH_ADMIN], authId: "auth-tech" });
    const teacher = await createUser(prisma, { roles: [Role.TEACHER], authId: "auth-teacher" });
    const cookie = signImpersonation({ act: tech.id, imp: teacher.id, iat: nowSec() });

    // يحاكي المعالج: await requireAuth ثمّ يعمل ويُصدِر حدثًا. يثبت انتشار السياق عبر await.
    const actor = await requireAuth(await reqFor("auth-tech", cookie), prisma);
    await emitEvent(prisma, { type: "TEST_ACTION", subjectType: "Student", subjectId: "s1", actorId: actor.id });

    const ev = await prisma.event.findFirstOrThrow({ where: { type: "TEST_ACTION" } });
    expect(ev.actorId).toBe(teacher.id); // الفعليّ (كأنه هو)
    expect(ev.impersonatorId).toBe(tech.id); // الحقيقيّ (لا يضيع)
  });

  it("بلا انتحال ⟵ الحدث بلا الفاعل الحقيقيّ (impersonatorId = null)", async () => {
    const teacher = await createUser(prisma, { roles: [Role.TEACHER], authId: "auth-teacher" });
    const actor = await requireAuth(await reqFor("auth-teacher"), prisma);
    await emitEvent(prisma, { type: "TEST_PLAIN", subjectType: "Student", subjectId: "s1", actorId: actor.id });
    const ev = await prisma.event.findFirstOrThrow({ where: { type: "TEST_PLAIN" } });
    expect(ev.actorId).toBe(teacher.id);
    expect(ev.impersonatorId).toBeNull();
  });

  it("stopImpersonation يوثّق الإنهاء بالفاعل الحقيقيّ", async () => {
    const tech = await createUser(prisma, { roles: [Role.TECH_ADMIN] });
    const teacher = await createUser(prisma, { roles: [Role.TEACHER] });
    const impActor: Actor = { id: teacher.id, roles: [Role.TEACHER], realActorId: tech.id, impersonating: true };
    await stopImpersonation(impActor, prisma);
    const ev = await prisma.event.findFirstOrThrow({ where: { type: "IMPERSONATION_STOPPED" } });
    expect(ev.actorId).toBe(tech.id);
    expect(ev.subjectId).toBe(teacher.id);
  });
});
