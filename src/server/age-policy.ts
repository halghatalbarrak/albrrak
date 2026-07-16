// سياسة الأعمار وربط الولي — DESIGN §٤، القاعدة المطلقة م٤.
// العمر محسوب من تاريخ الميلاد لا مُدخَل («عمرٌ يُكتب باليد يكذب بعد سنة»).

/** العمر بالسنوات الكاملة عند تاريخٍ مرجعي (asOf). */
export function computeAge(birthDate: Date, asOf: Date): number {
  let age = asOf.getFullYear() - birthDate.getFullYear();
  const m = asOf.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
}

export type GuardianRule =
  | "MANDATORY_NO_ACCOUNT" // دون ١٣: لا حساب، نافذة الولي إلزامية وموافقته شرط القيد
  | "GUARANTEED_BY_WILAYAH" // ١٣–١٧: مرتبط بحكم الولاية، والطالب يُخبَر
  | "BY_STUDENT_CONSENT"; // ١٨+: بإذن الطالب وله الرفض

export interface AccountPolicy {
  age: number;
  /** م٤: هل تُنشئ المنصة حسابًا للطالب نفسه؟ (دون ١٣ ⟵ لا). */
  createsStudentAccount: boolean;
  guardianRule: GuardianRule;
  /** ١٣–١٧: يُخبَر الطالب صراحةً أن وليّه يرى. */
  studentInformedOfGuardianVisibility: boolean;
}

/**
 * سياسة الحساب والولاية حسب العمر (§٤).
 * < ١٣ ⟵ لا حساب. ١٣–١٧ ⟵ حساب + ولاية مضمونة. ١٨+ ⟵ حساب + بإذنه.
 */
export function accountPolicy(age: number): AccountPolicy {
  if (age < 13) {
    return {
      age,
      createsStudentAccount: false,
      guardianRule: "MANDATORY_NO_ACCOUNT",
      studentInformedOfGuardianVisibility: false,
    };
  }
  if (age <= 17) {
    return {
      age,
      createsStudentAccount: true,
      guardianRule: "GUARANTEED_BY_WILAYAH",
      studentInformedOfGuardianVisibility: true,
    };
  }
  return {
    age,
    createsStudentAccount: true,
    guardianRule: "BY_STUDENT_CONSENT",
    studentInformedOfGuardianVisibility: false,
  };
}
