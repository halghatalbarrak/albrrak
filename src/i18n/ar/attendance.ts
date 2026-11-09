// قاموس نصوص شاشة رصد الحضور (العربيّة). الاتّجاه RTL.

export const attendanceAr = {
  everyonePresent: "الجميع حاضرون افتراضًا — أشِّر الغائب فقط.",
  selectCircle: "— اختر حلقة —",
  sync: "مزامنة",
  saveBtn: "حفظ الرصد",
} as const;

export type AttendanceKey = keyof typeof attendanceAr;
export function tAttendance(key: AttendanceKey): string {
  return attendanceAr[key];
}
