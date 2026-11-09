// قاموس نصوص مكوّن AppShell + CommandPalette (العربيّة). يُستدعى عبر tAppshell.

export const appshellAr = {
  brandLine1: "حلقات الشيخ",
  brandLine2: "محمد البراك",
  search: "بحث ",
  noResults: "لا نتائج.",
  searchHint: "اكتب حرفين فأكثر. جرّب: اسم طالب، أو «حزب ٦٠»، أو «١١٤:١».",
} as const;

export type AppshellKey = keyof typeof appshellAr;

export function tAppshell(key: AppshellKey): string {
  return appshellAr[key];
}
