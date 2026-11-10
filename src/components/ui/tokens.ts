// رموز الهوية للأنماط السطريّة. الألوان تشير إلى متغيّرات CSS (globals.css) لتعمل
// الهوية والوضع الداكن معًا (الفكرة ٦): تبديل [data-theme] يغيّر القيَم دون لمس المكوّنات.

export const ui = {
  font: "'IBM Plex Sans Arabic', system-ui, sans-serif",
  color: {
    primary: "var(--color-primary)", primaryHover: "var(--color-primary-hover)",
    bronze: "var(--color-bronze)", bronzeHover: "var(--color-bronze-hover)",
    bg: "var(--color-bg)", surface: "var(--color-surface)",
    text: "var(--color-text)", muted: "var(--color-muted)", border: "var(--color-border)",
    success: "var(--color-success)", danger: "var(--color-danger)",
    soft: "var(--color-soft)", // خلفيّةٌ ناعمة (ترويسة الجدول، العنصر النشط)
    warnBg: "var(--color-warn-bg)", okBg: "var(--color-ok-bg)",
    gold: "var(--gold)",          // تدرّجٌ ذهبيّ (خلفيّةٌ فقط)
    goldLine: "var(--gold-line)", // خطٌّ ذهبيّ للإطارات والزخارف
    teal: "var(--color-teal)",    // فيروزيٌّ نبويٌّ هادئ
    // الشريط الجانبيّ (بنفسجيٌّ داكن في الوضعين)
    sidebar: "var(--color-sidebar)", sidebarText: "var(--color-sidebar-text)",
    sidebarMuted: "var(--color-sidebar-muted)", sidebarAccent: "var(--color-sidebar-accent)",
    sidebarActiveBg: "var(--color-sidebar-active-bg)",
    sidebarDivider: "var(--color-sidebar-divider)", // فاصلٌ خافتٌ
    // دلاليّةٌ جديدة
    onPrimary: "var(--color-on-primary)",          // نصٌّ على primary/danger/rank (يتكيّف مع الوضع)
    onBronze: "var(--color-on-bronze)",            // نصٌّ على زرّ bronze
    ghostText: "var(--color-ghost-text)",          // نصّ زرّ ghost
    impersonation: "var(--color-impersonation)",          // شريط الانتحال (ثابت)
    onImpersonation: "var(--color-on-impersonation)",     // نصّ شريط الانتحال (ثابت أبيض)
    warning: "var(--color-warning)",   // تحذير
    overlay: "var(--color-overlay)",   // حجاب Modal / CommandPalette
    errorFill: "var(--color-error-fill)",     // تظليل آية الخطأ في المصحف
    errorStroke: "var(--color-error-stroke)", // حدّ آية الخطأ في المصحف
    // الشاشة التحفيزيّة (TV) — ثابتةٌ لا تستجيب للوضع الداكن
    displayBgGrad: "var(--display-bg-gradient)",
    displayOverlay: "var(--display-overlay)",
    displayGoldAlpha: "var(--display-gold-alpha)",
    displayGoldSoft: "var(--display-gold-soft)",
    displayGoldBg: "var(--display-gold-bg)",
    displayGoldBar: "var(--display-gold-bar)",
    displayGlass: "var(--display-glass)",
    displayOnGold: "var(--display-on-gold)",
  },
  radius: { sm: "4px", md: "8px", lg: "16px", full: "999px" },
  text: { xs: "14px", base: "16px", lg: "20px", xl: "24px", xxl: "32px", xxxl: "40px" },
  shadowCard: "var(--shadow-card)",
  shadowPanel: "var(--shadow-panel)",       // لوحٌ / قائمةٌ منسدلة
  shadowElevated: "var(--shadow-elevated)", // عناصرٌ عائمة (شريط الانتحال...)
  shadowGold: "var(--shadow-gold)",         // وميضٌ ذهبيّ حول البطاقة
  displayShadowImage: "var(--display-shadow-image)",
  displayTextShadow: "var(--display-text-shadow)",
} as const;

/** مضاعفات التباعد على أساس ٤px: sp(4) = 16px. */
export const sp = (n: number): string => `${n * 4}px`;
