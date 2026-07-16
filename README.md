<div dir="rtl">

# منصة حلقات البراك

منصة إدارة حلقات التحفيظ (القاعدة المدنية • مراقي). أُعيد بناؤها بمخطط نظيف وفق
`DESIGN.md` (٥٠ قرارًا) و`BUILD_PLAN.md`.

> **الحالة:** المرحلة صفر (م٠) — الأساس والأمان. القلب (المراحل، المسارات،
> الجلسة، الحصاد، الشهادات) يُبنى في المراحل التالية.

---

## المكدَّس التقني

| الطبقة | التقنية |
|---|---|
| الإطار | **Next.js** (App Router) |
| اللغة | **TypeScript** (strict) |
| الأنماط | **Tailwind CSS** + `src/app/legacy.css` (نظام RTL منقول) |
| قاعدة البيانات | **Supabase (PostgreSQL)** |
| ORM والترحيلات | **Prisma** — مصدر الحقيقة الوحيد للمخطط |
| الأمان | RLS مغلقة على كل جدول (بلا سياسة مفتوحة) + ترويسات `vercel.json` |
| النشر | **Vercel** |

## البنية

```
albrrak/
├─ DESIGN.md · BUILD_PLAN.md      # مرجعا الحقيقة
├─ prisma/
│  ├─ schema.prisma              # المخطط (DESIGN §١٣)
│  └─ migrations/0_init/         # ترحيل واحد نظيف + إغلاق RLS
├─ src/
│  ├─ app/                       # layout · page · globals.css · legacy.css
│  └─ lib/prisma.ts              # عميل Prisma (singleton)
├─ .github/workflows/ci.yml      # tsc + lint + build على كل push
├─ .env.example                  # أسماء المتغيّرات (بلا قيم)
└─ vercel.json                   # ترويسات الأمان (CSP · HSTS · …)
```

## قاعدة العمل الحاكمة

**لا commit إلا بعد أن تخضرّ الثلاثة:**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Prisma هو المصدر الوحيد للمخطط — **لا SQL يدوي في لوحة Supabase**. كل تغيير = ترحيل مرقّم.

---

## التشغيل محليًّا

```bash
npm install                 # يثبّت الحزم ويولّد عميل Prisma
cp .env.example .env        # ثم املأ القيم من جهازك (لا تُرفع أبدًا)
npm run dev                 # http://localhost:3000
```

## الاختبارات (قاعدة العمل ٤)

القواعد المطلقة (م١/م٣/م٥، التفويض، الاعتمادات) مُنفَّذة في الخادم، ولكلٍّ اختبارٌ
يثبت أن تجاوزها **يُرفض** — على Postgres حقيقي لا وهمي:

```bash
# تحتاج قاعدة Postgres اختبارية + مفتاح تشفير عابر
export DATABASE_URL="postgresql://postgres@127.0.0.1:5432/albrrak_test"
export DIRECT_URL="$DATABASE_URL"
export NATIONAL_ID_ENC_KEY="$(openssl rand -base64 32)"
npx prisma migrate deploy   # يطبّق الترحيلات على قاعدة الاختبار
npm test                    # vitest
```

في CI تعمل تلقائيًّا بخدمة Postgres (`.github/workflows/ci.yml` ← وظيفة `test`).

## تطبيق المخطط على القاعدة (من جهازك)

```bash
# يطبّق ترحيل م٠ (إنشاء الجداول + تفعيل RLS المغلقة)
npx prisma migrate deploy
```

> **الأمان:** المفتاح العام (anon) مصمَّم ليكون عامًّا؛ الحماية في **RLS** لا في إخفائه.
> بعد الترحيل، كل جدول تُفعَّل عليه RLS بلا أي سياسة ⟵ لا يقرأ العميل العام شيئًا.

## النشر على Vercel

اربط المستودع بمشروع Vercel، واضبط متغيّرات البيئة (`DATABASE_URL`، `DIRECT_URL`،
`NEXT_PUBLIC_SUPABASE_URL`، `NEXT_PUBLIC_SUPABASE_ANON_KEY`) من إعدادات المشروع.

---

*خاص ومحدود التداول — Confidential.*

</div>
