# تقرير الصيانة الشاملة — منصة حلقات البراك
<!-- لا بيانات شخصية ولا أسرار في هذا الملف -->
> تاريخ التقرير: 2026-11-15  
> الفرع الأساسي: `main`  
> آخر commit مدموج: PR #212 (fix i18n: نقل «حذف» إلى القاموس)

---

## أ) سرعة التطوير

### زمن CI (آخر ١٠ تشغيلات)

| التشغيل | النتيجة | الزمن الكلّي |
|---------|---------|------------|
| ١ (أحدث) | success | ٢:٢٢ |
| ٢ | success | ٢:٥٥ |
| ٣ | success | ٣:١١ |
| ٤ | failure | ٢:٠٨ (i18n gate) |
| ٥ | failure | ٢:١٢ (i18n gate) |
| ٦ | success | ٢:١٦ |
| ٧ | success | ٢:٣٨ |
| ٨ | success | ٣:٠٧ |
| ٩ | success | ٢:٤١ |
| ١٠ | success | ٢:٢٢ |

**متوسط CI الناجح:** ~٢:٤٠ | **الذروة:** ٣:١١

**توزيع الـjobs (تشغيل موازٍ):**
- `server rule tests (Postgres)`: ٢:١٩
- `tsc + lint + build`: ١:٤٦
- `prod schema in sync`: ٠:٣٦
- `author-check`: ٠ ثانية (مشروط بـPR فقط)

**الأسطر والملاحظات:**
- الـ3 jobs تعمل **موازيًا** (لا `needs:` بينها) ✓
- `npm ci` يُستدعى **4 مرّات** عبر الـworkflows لكنّ كلاً منها في job مستقلّ → حسنٌ ✓
- `cache: npm` مفعَّل لكلّ job ✓
- **`.next/cache` لا يُخزَّن** — يُعاد البناء كاملاً كل مرّة (**خسارة ~40ثانية**)
- **Node.js 20 مهجورٌ على GitHub Actions** — تحذير مكرَّر في كلّ تشغيل
- **تحذيرَا فشلٍ في `arif.test.ts` (سطرا 172 و181)** ظاهران في الـannotations رغم نجاح الـjob → يحتاج تحقيقاً

**ملاحظات Windows/PowerShell:**
- القاعدة القديمة (قبل هذا التقرير) كانت PowerShell وأوامر `&&` غير المدعومة → تسبّبت في إعادة ~30% من الأوامر محلياً
- `worktree` خارج المستودع مطلوبٌ لكنّ المسار لم يكن موثَّقاً في CLAUDE.md بوضوح كافٍ
- الانتقال إلى Bash المحدَّد (من هذا التقرير) يُصحّح المشكلة

### مؤشرات PRs الأخيرة (آخر 30 PR)
- **PR بحاجة لأكثر من push:** متكرّرة بسبب i18n gate + أخطاء TypeScript → ٣-٤ pushes/PR بالمتوسط
- **أكثر الملفات تعارضاً:** `src/app/admin/unified/page.tsx` و`prisma/schema.prisma` و`.github/workflows/ci.yml`

---

## ب) صحة الكود

### أكبر ٢٠ ملفاً

| الملف | الأسطر | ملاحظة |
|-------|-------|--------|
| `src/app/admin/unified/page.tsx` | **880** | ضخمٌ جداً — يجب تقسيمه |
| `src/server/daily-session.ts` | 813 | مقبول (منطق معقّد) |
| `src/server/attendance.ts` | 750 | مقبول |
| `src/server/market.ts` | 688 | مقبول |
| `src/server/economy.ts` | 636 | مقبول |
| `src/server/user-management.ts` | 557 | مقبول |
| `src/server/student-import.ts` | 485 | مقبول |
| `src/i18n/ar/errors.ts` | 484 | يكبر مع كل ميزة |
| `src/server/muddakir-supervisor.ts` | 473 | مقبول |
| `src/server/qaidah-session.ts` | 455 | مقبول |
| `src/app/admin/students/page.tsx` | 451 | قريب من الحدّ |
| `src/server/muddakir-day.ts` | 442 | مقبول |
| `src/server/civil-base.ts` | 418 | مقبول |
| `src/app/admin/students/[id]/placement/page.tsx` | 417 | قريب من الحدّ |
| `src/app/muddakir/page.tsx` | 415 | قريب من الحدّ |
| `src/server/__tests__/http.test.ts` | 392 | اختبارات |
| `src/server/application.ts` | 386 | مقبول |
| `src/app/admin/display/page.tsx` | 372 | مقبول |
| `src/server/certificate.ts` | 364 | مقبول |
| `src/app/admin/users/page.tsx` | 360 | مقبول |

**خلاصة:** `unified/page.tsx` وحده يتجاوز الحدّ المقبول بكثير.

### الأنماط المكتوبة مباشرةً (inline styles)
- **1027 استخدامًا** لـ`style={{` في `src/app/`
- 154 استخدامًا لـ`style={{` في `src/components/`
- **لا Tailwind ولا CSS modules** — النمط المعتمد هو `ui.color.*` و`sp()` وpx hardcoded
- **الأثر:** صيانةٌ أصعب وتكرارٌ في padding/gap/color غير المُعبَّر عنها بـtokens

### TypeScript `any`
- `: any` ← **0** ✓ (ممتاز)
- `as any` ← **0** ✓

### الكود الميت / غير المستعمل
- `Circle.programId`: موثَّقٌ كـ«مهجور واختياري» في الـschema — **يحتاج موافقة الحذف**
- `Circle.location`: مستعمل في نموذج الحلقات (مقبول)
- لا knip/jscpd مُشغَّل → لا أرقام دقيقة؛ تحليل يدوي لا يظهر تكراراً صارخاً

### تغطية الاختبارات
- الاختبارات تغطّي: application, arif, attendance-lock, daily-session, gamification, hasad, http, و[others]
- **لا اختبار للرحلة الأساسية كاملةً من البداية للنهاية** ← المطلوب في الصيانة

---

## ج) قاعدة البيانات

### أعمدة وجداول مهملة
| العمود/الجدول | الحالة | التوصية |
|---------------|--------|---------|
| `Circle.programId` | «مهجور واختياري» (comment في الـschema) | **حذف بعد موافقة** |
| `Circle.location` | قيمةٌ اختيارية، قد تكون فارغة | يُبقَى |
| `DailySession.circleId` | مستعمل في فهارس وqueries | يُبقَى |

### الفهارس الموجودة والناقصة

**موجودة ✓:** `DailySession([circleId,date])`, `Enrollment([studentId,endedAt])`, `ArifAppointment([circleId,endedAt],[arifUserId,endedAt])`, `PointTransaction([studentId],[pointItemId])`, `Purchase([studentId],[sellerUserId])`, `Application([status,createdAt],[deletedAt])`, `Event([subjectType,subjectId],[type,createdAt])`, `AuditLog([entity,entityId],[actorId],[at])`

**ناقصة :**
| الجدول | الحقل | الاستخدام | الخطورة |
|--------|-------|-----------|---------|
| `Purchase` | `marketItemId` | يُستعمل في تقارير «ما اشتراه الطالب» | منخفضة (stock مخزَّنٌ على MarketItem) |
| `AutoGrant` | `sourceRef` فقط (بدون partial index في schema) | partial index موجودٌ في SQL خام | ـ (محلولٌ بـSQL raw) |

### استعلامات N+1
- **daily-session.ts**: `for` loop على `coverRanges` داخل `giveRasikh` (اختبارات فقط) ✓
- **unified/page.tsx**: يجلب كل بيانات الطالب في استدعاءٍ واحد لـ`/api/circles/[id]/session` ✓ (لا N+1 في الـAPI)
- **attendance.ts**: لا `for await` مكتشَف ✓

### أبطأ الاستعلامات (تقدير)
- `PointTransaction.SUM(amount)` داخل بيع السوق: aggregate بلا cache — يبطؤ مع كبر الدفتر
- `grantAuto`: يبحث في AutoGrant partial index على كل حدث

---

## د) سرعة الموقع

### منطقة Vercel مقابل Supabase
- **Supabase:** فرانكفورت `eu-central-1` (Frankfurt)
- **Vercel `vercel.json`:** لا `"regions"` محدَّدة ← يستعمل الـdefault (الغالب `iad1` US East أو auto)
- **الأثر:** إن كانت الدوال تعمل في US East، فكل استعلامٍ لقاعدة البيانات يقطع ~180ms ذهاباً وإياباً عبر المحيط الأطلسي
- **خطورة: عالية** — يُحتاج تحقيق وتعيين `"regions": ["fra1"]`

### حجم JS / سرعة الصفحات
- لم يُشغَّل `next build --analyze` محلياً — الأرقام الدقيقة غير متاحة
- `.next/static/chunks` موجودٌ من build سابق
- الصفحات الثقيلة المحتملة: `unified/page.tsx` (880 سطراً كلها client-side)

### Lighthouse
- لم يُشغَّل في هذه الجلسة (يحتاج Preview URL)

### الصفحات التي تجلب أكثر مما تعرض
- `unified/page.tsx`: تجلب كل بيانات الطالب + قيود + تفاصيل مسار + مراجعة — مقصودٌ للأداء (all-in-one) ✓
- `/admin/students/page.tsx`: قد تجلب بياناتٍ عن طلاب آخر ← يحتاج مراجعة

---

## هـ) الثغرات الأمنية

### npm audit
```
critical: 3 (zod chain عبر chromium-bidi ← puppeteer-core)
high: 14 (نفس السلسلة)
moderate: 11
```
**السبب:** `puppeteer-core` المستخدَم في توليد الشهادة يعتمد على `chromium-bidi` الذي يعتمد على `zod < 4.6.6`  
**الإصلاح:** `npm audit fix` يُصلح zod مباشرةً؛ puppeteer قد يحتاج ترقية رئيسية (تحتاج موافقة)

### مسارات بلا تحقّق صلاحية — الجدول الكامل

| المسار | الوضع | التقييم |
|--------|-------|---------|
| `/api/activate` | عام عمداً — الرمز هو الإثبات | ✓ مقبول |
| `/api/certificate-preview` | **بلا auth — يخدم بياناتٍ نموذجية فقط** | ⚠️ منخفض (لا بيانات حقيقية) |
| `/api/cron/weekly-reports` | محميٌّ بـ`CRON_SECRET` في Authorization | ✓ مقبول |
| `/api/display/[token]` | الرمز هو الإثبات + rate limit 40req/min | ✓ مقبول |
| `/api/muddakir/*` | محميٌّ بـ`requireMuddakir()` | ✓ مقبول |
| `/api/registration-options` | بياناتٌ مرجعيّة (جنسيات/مراحل دراسية) | ✓ مقبول |
| `/api/verify/[token]` | تحقّقٌ عام بالرمز، يكشف حدًّا أدنى فقط | ✓ مقبول |

**خلاصة:** لا مسارات حساسة بلا تحقّق. كل «غير محمي» له مبرّرٌ مشروع.

### حماية من التخمين / rate limit
| نقطة | الوضع |
|------|-------|
| `/api/activate` | **لا rate limit** — المهاجم يجرّب رموزاً عشوائية |
| `/api/display/[token]` | rate limit 40req/min ✓ |
| Supabase Auth (login) | مُدار من Supabase ✓ |

**خطورة:** متوسطة — رموز التفعيل عشوائيةٌ قوية (`@unique` في DB)، لكنّ غياب rate limit يُتيح كشف التوقيت.

### ترويسات الأمان
| الترويسة | الوضع |
|---------|-------|
| `Content-Security-Policy` | ✓ موجود — لكنّ `'unsafe-inline'` لـscripts |
| `Strict-Transport-Security` | ✓ `max-age=63072000; includeSubDomains; preload` |
| `X-Content-Type-Options` | ✓ `nosniff` |
| `X-Frame-Options` | ✓ `DENY` |
| `Referrer-Policy` | ✓ `strict-origin-when-cross-origin` |
| `Permissions-Policy` | ✓ موجود |
| `Cross-Origin-Opener-Policy` | ✓ `same-origin` |
| `X-XSS-Protection` | غير موجود (مهجورٌ على المتصفحات الحديثة) |

**CSP `unsafe-inline`:** Next.js يحتاجه للـscripts في App Router. الحلّ المثالي nonce-based لكنه معقّد.

### RLS (Row-Level Security)
- لا مجلّد `supabase/` في المستودع → الإعدادات تتمّ عبر لوحة Supabase
- لا يمكن التحقّق من الكود وحده — يحتاج قراءة من لوحة Supabase (**تحتاج موافقة**)
- الحماية الأساسية تعتمد على `SUPABASE_SERVICE_ROLE_KEY` في الخادم والـAPI routes → تحقّق الصلاحيات في طبقة Next.js

### بيانات شخصية زائدة في API
- `nationalId` مشفَّرٌ على مستوى التطبيق ✓
- `/api/admin/students/[id]/reveal-id` يحتاج دورًا خاصاً (REGISTRAR/SUPER_ADMIN) ✓
- `/api/applications` يعرض رقم جوال الولي → متاحٌ للأدوار المصرَّح لها فقط ✓

### أسرار في المستودع
- **لا `.env` ولا أسرار في الكود المتتبَّع** ✓
- Workflow secrets تُمرَّر عبر `${{ secrets.* }}` ✓
- **لا artifacts في أيّ workflow** ✓ (المستودع عام)

### رسائل الأخطاء
- `errorResponse()` تُعيد مفتاح الخطأ المترجَم لا stack trace ✓
- `console.error` يُسجَّل server-side لا client-side ✓

---

## و) التشغيل

### النسخ الاحتياطي
- **Supabase Free tier:** نسخٌ احتياطيةٌ تلقائية محدودة (يوميّ فقط، 1 يوم) — **لا Point-in-Time Recovery**
- **الخطورة: عالية** — أيّ حذفٍ خاطئ لبيانات الإنتاج قد لا يُستعاد
- **التوصية (تحتاج موافقة):** pg_dump مجدوَلٌ أسبوعياً → ملفٌّ مشفَّرٌ على Supabase Storage الخاص أو Drive

### مراقبة الأخطاء
- **لا Sentry ولا تكاملٌ خارجيّ** — الأخطاء تُكتب في `console.error` فقط
- **الخطورة: متوسطة** — أخطاء الإنتاج لا تُنبَّه عنها فوراً

### Keep-alive
- `db-keepalive.yml` يُشغَّل كل 3 أيام بـ`SELECT 1` ✓
- الكرون اليومي (`weekly-reports`) يُبقي قاعدة البيانات نشطة ✓

---

## ملخّص الأولويات (١٥ سطراً)

### أخطر ٥ ثغرات
1. **[عالية] منطقة Vercel غير محدَّدة** — الدوال ربما تعمل في US East مع قاعدة Frankfurt (+180ms/req)
2. **[عالية] npm: 3 critical + 14 high** من سلسلة puppeteer/chromium-bidi/zod — `audit fix` متاح
3. **[متوسطة] لا rate limit على `/api/activate`** — رموز التفعيل عرضةٌ لكشف التوقيت
4. **[متوسطة] لا مراقبة أخطاء إنتاج** — أعطالٌ صامتة لا يُنبَّه عنها
5. **[متوسطة] نسخ Supabase Free محدودة (يوم واحد فقط)** — لا Point-in-Time Recovery

### أكبر ٥ أسباب للبطء
1. **منطقة Vercel خاطئة** (إن كانت US East) — +180ms لكل request
2. **`.next/cache` غير مخزَّن في CI** — إعادة بناء كاملة كل مرّة (+40 ثانية)
3. **unified/page.tsx ضخم (880 سطراً)** — كل الكود يُحمَّل client-side
4. **1027 inline style** بلا تحسين نظام التوكنات
5. **Node.js 20 مهجور** — تحذيرات تُبطئ CI وتُشوّش المخرجات

### الخطة المرتَّبة

| الأولوية | البند | نوع | مدّة المتوقّع |
|---------|-------|-----|--------------|
| ١ | npm audit fix (zod + safe packages) | PR صغير | <30د |
| ٢ | rate limit على `/api/activate` | PR صغير | <1س |
| ٣ | `vercel.json`: `"regions": ["fra1"]` | PR صغير | <15د |
| ٤ | Node.js 20 → 24 في CI | PR صغير | <15د |
| ٥ | `.next/cache` في CI | PR صغير | <15د |
| ٦ | تقسيم `unified/page.tsx` | PR متوسط | <3س |
| ٧ | اختبار الرحلة الأساسية | PR كبير | <4س |
| ٨ | تحديث CLAUDE.md + HANDOFF.md | مباشر | <30د |
| — | حذف `Circle.programId` | **تحتاج موافقة** | ـ |
| — | ترقية puppeteer (breaking) | **تحتاج موافقة** | ـ |
| — | نسخ احتياطية مجدوَلة | **تحتاج موافقة** | ـ |
| — | مراقبة أخطاء خارجية (Sentry) | **تحتاج موافقة** | ـ |
| — | RLS inspection عبر Supabase | **تحتاج موافقة** | ـ |
