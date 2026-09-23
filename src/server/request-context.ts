import { AsyncLocalStorage } from "node:async_hooks";

// ═══════════════ سياق الطلب — الفاعل الحقيقيّ أثناء الانتحال ═══════════════
//
// ميزة انتحال الشخصيّة (الضمان ٢: توثيقٌ مزدوجٌ صارم) تتطلّب أن يعرف emitEvent — في
// أيّ موضعٍ عميق — مَنِ الفاعلُ الحقيقيّ (المدير التقنيّ) حين يقع الفعل أثناء انتحال.
// تمريره خيطًا عبر عشرات دوالّ الخادم هشٌّ ومعرّضٌ لضياع أثر. فنستعمل سياقًا خاصًّا
// بالطلب (AsyncLocalStorage).
//
// **آليّةٌ موثوقة (لا enterWith بعد await):** يُدخَل السياق **تزامنيًّا** في مقدّمة
// requireAuth — قبل أيّ await — فيقع في سياق المعالج نفسه (الدالّة async تنفّذ مقدّمتها
// تزامنيًّا في سياق المنادي). المخزَّن **كائنٌ قابلٌ للتعديل**: تُدخِله بقيمةٍ مبدئيّة،
// ثمّ يُعدّله requireAuth بعد حسم الانتحال. كلّ الأحفاد (بعد await) يرثون **نفس المرجع**،
// فيرون التعديل. هكذا يُختَم كلّ حدثٍ آليًّا بلا لمس المعالجات الـ٣٩.

export interface RequestContext {
  /** الفاعل الحقيقيّ (المدير التقنيّ) إن كان الطلب أثناء انتحال؛ null خلاف ذلك. */
  impersonatorId: string | null;
}

const store = new AsyncLocalStorage<RequestContext>();

/**
 * يُدخِل سياقًا قابلًا للتعديل لهذا الطلب. **يُستدعى تزامنيًّا في مقدّمة requireAuth**
 * (قبل أيّ await) ليقع في سياق المعالج فيرثه كلّ ما بعده.
 */
export function enterRequestContext(): void {
  store.enterWith({ impersonatorId: null });
}

/** يضبط الفاعل الحقيقيّ في سياق الطلب الجاري (بعد حسم الانتحال في requireAuth). */
export function setImpersonator(realActorId: string | null): void {
  const ctx = store.getStore();
  if (ctx) ctx.impersonatorId = realActorId;
}

/** الفاعل الحقيقيّ للطلب الجاري (يقرؤه emitEvent). null إن لا انتحال أو لا سياق. */
export function currentImpersonatorId(): string | null {
  return store.getStore()?.impersonatorId ?? null;
}
