# CLAUDE.md — قواعد العمل في مستودع منصّة البراك

> المرجع الملزم لبرنامج المُدَّكِر: `MUDDAKIR_RULES.md` (اقرأه كاملاً قبل أيّ عملٍ يمسّه).
> المرجع الملزم لقفل الحضور: `docs/ATTENDANCE_LOCK_RULES.md` (اقرأه قبل أيّ عملٍ يمسّ قفل يوم الحضور).
> المرجع الملزم للتوطين (ar/en/ru): `docs/I18N_GLOSSARY.md` (اقرأه قبل أيّ ترجمةٍ في `src/i18n/en` أو `src/i18n/ru`).

## الفحص والاختبارات (ويندوز)

- **على هذا الجهاز (ويندوز) لا يُشغَّل `vitest` محليّاً.** الفحص المحلّيّ = `tsc` + `lint` + `build` فقط.
- الاختبارات الكاملة تجري على CI، وتُتابَع عبر `gh pr checks --watch` **في المقدّمة**.
- **لا يُترَك أيّ أمر في الخلفيّة لانتظاره** (لا `run_in_background`، ولا حلقات انتظارٍ خلفيّة).

## الحسابات

- **حسابات البراك الوحيدة:** GitHub `halghatalbarrak`، وبريد Git `thmny88@gmail.com`، وVercel فريق `albarrak11` بحساب `thmny88`. أيّ ظهور لـ `alameen5509` أو `marsa1` أو `smsmf123321-afk` أو `istedama-creator` أو `albtaqtalsyahyt-sketch` يعني توقّفاً فوريّاً وإبلاغ المدير.
- **لا تستعمل `-c user.email=…` ولا `-c user.name=…` في أيّ أمر git.** اعتمد على إعداد المستودع المحلّيّ وحده، وتحقّق قبل كلّ commit أنّ `git config user.email` يساوي `thmny88@gmail.com`، وإلّا فتوقّف.

## الدفع والدمج

- الدفع وفتح الـ PR بحساب `halghatalbarrak`، وهويّة git للـ commits بريدها `thmny88@gmail.com`.
- **صدِّر `GH_CONFIG_DIR` صراحةً في بداية كلّ أمرٍ فيه `gh` أو `git push`** (لا تعتمد على `.claude/settings.local.json` وحده):
  - في Bash: `export GH_CONFIG_DIR="C:\Users\mmosa\.gh-albrrak"`
  - في PowerShell: `$env:GH_CONFIG_DIR = "C:\Users\mmosa\.gh-albrrak"`
- **الحارس قبل كلّ `push` أو دمج** — تحقّق أنّ الحساب النشط اسمه `halghatalbarrak` **تحديداً**، وإلّا فتوقّف:
  ```
  export GH_CONFIG_DIR="C:\Users\mmosa\.gh-albrrak"
  gh auth switch --user halghatalbarrak
  test "$(gh api user -q .login)" = "halghatalbarrak"   # يجب أن يُرجع halghatalbarrak بالضبط، وإلّا توقّف
  ```
  (لا تكتفِ بـ`gh auth status | grep "Active account: true"` — فهو يمرّ بأيّ حساب؛ وقد مرّ فعلاً بحساب `istedama-creator` خطأً.)
- لا تغيّر إعدادات gh الافتراضيّة (`~/.config/gh`)، ولا تُسجّل خروج أيّ حسابٍ منها.
- لا دمج بلا إذنٍ صريح.
