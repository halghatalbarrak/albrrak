# CLAUDE.md — قواعد العمل في مستودع منصّة البراك

> المرجع الملزم لبرنامج المُدَّكِر: `MUDDAKIR_RULES.md` (اقرأه كاملاً قبل أيّ عملٍ يمسّه).
> المرجع الملزم لقفل الحضور: `docs/ATTENDANCE_LOCK_RULES.md` (اقرأه قبل أيّ عملٍ يمسّ قفل يوم الحضور).
> المرجع الملزم للتوطين (ar/en/ru): `docs/I18N_GLOSSARY.md` (اقرأه قبل أيّ ترجمةٍ في `src/i18n/en` أو `src/i18n/ru`).

## الفحص والاختبارات (ويندوز)

- **على هذا الجهاز (ويندوز) لا يُشغَّل `vitest` محليّاً.** الفحص المحلّيّ = `tsc` + `lint` + `build` فقط.
- الاختبارات الكاملة تجري على CI، وتُتابَع عبر `gh pr checks --watch` **في المقدّمة**.
- **لا يُترَك أيّ أمر في الخلفيّة لانتظاره** (لا `run_in_background`، ولا حلقات انتظارٍ خلفيّة).

## الدفع والدمج

- الدفع وفتح الـ PR بحساب `halghatalbarrak` (`gh auth switch --user halghatalbarrak`)، وهويّة git للـ commits `alameen5509`.
- `GH_CONFIG_DIR` معزولٌ لهذا المشروع عبر `.claude/settings.local.json` (قيمته `C:\Users\mmosa\.gh-albrrak`) — إعدادات gh منفصلةٌ عن الافتراضيّة. ومع ذلك يبقى حارس `gh auth switch --user halghatalbarrak` ثمّ `gh auth status` قبل كلّ push أو دمج كما هو.
- لا دمج بلا إذنٍ صريح.
