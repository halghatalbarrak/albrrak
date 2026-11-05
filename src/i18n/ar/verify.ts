// قاموس نصوص صفحة التحقّق العامّة من الشهادة (الفكرة ١٠) — العربيّة. يُستدعى عبر tVerify. حرفيّاً.

export const verifyAr = {
  brand: "حلقات الشيخ محمد البراك",
  verifying: "…جارٍ التحقّق",
  unknownCert: "شهادةٌ غير معروفة",
  noCertForCode: "لا نجد شهادةً بهذا الرمز.",
  revokedCert: "هذه الشهادة مُبطَلة",
  validCert: "شهادةٌ صحيحة",
  excellent: "تميّز",
  rowName: "الاسم",
  rowCert: "الشهادة",
  rowIssuedAt: "تاريخ الإصدار",
  rowRank: "المرتبة",
  rowIssuer: "الجهة المُصدِرة",
} as const;

export type VerifyKey = keyof typeof verifyAr;

/** يُرجع النصّ العربيّ لمفتاحٍ من قاموس صفحة التحقّق. */
export function tVerify(key: VerifyKey): string {
  return verifyAr[key];
}
