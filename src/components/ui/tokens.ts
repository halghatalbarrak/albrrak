// رموز الهوية للأنماط السطريّة (تعكس متغيّرات globals.css). المرحلة ١ — لا منطق.

export const ui = {
  font: "'IBM Plex Sans Arabic', system-ui, sans-serif",
  color: {
    primary: "#574F47", primaryHover: "#443d37",
    bronze: "#A9834F", bronzeHover: "#8f6d40",
    bg: "#F5F0E8", surface: "#FFFFFF",
    text: "#2b2620", muted: "#7a7167", border: "#e6dfd2",
    success: "#1F5C3D", danger: "#a1231d",
  },
  radius: { sm: "4px", md: "8px", lg: "16px", full: "999px" },
  text: { xs: "14px", base: "16px", lg: "20px", xl: "24px", xxl: "32px", xxxl: "40px" },
  shadowCard: "0 1px 3px rgba(60,50,40,.08), 0 1px 2px rgba(60,50,40,.05)",
} as const;

/** مضاعفات التباعد على أساس ٤px: sp(4) = 16px. */
export const sp = (n: number): string => `${n * 4}px`;
