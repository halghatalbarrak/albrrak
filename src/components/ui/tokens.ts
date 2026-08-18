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
  },
  radius: { sm: "4px", md: "8px", lg: "16px", full: "999px" },
  text: { xs: "14px", base: "16px", lg: "20px", xl: "24px", xxl: "32px", xxxl: "40px" },
  shadowCard: "var(--shadow-card)",
} as const;

/** مضاعفات التباعد على أساس ٤px: sp(4) = 16px. */
export const sp = (n: number): string => `${n * 4}px`;
