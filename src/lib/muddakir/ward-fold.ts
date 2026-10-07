// طيّ أيّام الورد زمنيّاً (§١٢ + تعديل محمد ١) — نقيّ، محايدٌ لترتيب الوصول (يُفرز بالتاريخ ثمّ
// يُطوى). يحسب المؤشّر وحالة كلّ يوم والمتبقّي (carry) بمؤشّر التعويض: كلّ يومٍ يُعرض ورده مع
// وردٍ فائتٍ واحدٍ على الأكثر؛ إتمام وردين ⟵ الجدول في موعده، إتمام واحدٍ ⟵ تأخّر، صفرٌ ⟵ تقصير
// (بلا عذر) والجدول يتأخّر. الورد لا يسقط أبداً.

export type WardDayStatus = "COMPLETE" | "MADE_UP" | "SHORTFALL" | "EXCUSED" | "OPEN";

export interface WardDayEntry {
  dayDate: string; // YYYY-MM-DD (بتوقيت مكّة)
  completed: number; // أوراد أُتمّت في اليوم (من الأحداث)
  excused: boolean; // عذرٌ في اليوم
  open?: boolean; // اليوم جارٍ بعد (لم ينتهِ) — لا يُحسب تقصيراً
}

export interface WardDayResult {
  dayDate: string;
  shown: number; // أوراد عُرضت (١ أو ٢ بالتعويض)
  completed: number;
  carryOut: number; // فائتٌ مُرحَّلٌ للغد (٠ أو ١)
  pointerAfter: number; // المؤشّر بعد اليوم
  status: WardDayStatus;
}

export interface WardFold {
  days: WardDayResult[];
  pointer: number; // المؤشّر النهائيّ (عدد الأوراد المُتمّة)
  carry: number; // فائتٌ مُرحَّلٌ بعد آخر يوم
}

/**
 * يطوي أيّام الورد من `startPointer`. لكلّ يوم: shown = carry + ١ (سقف ٢)؛ المؤشّر يتقدّم بكلّ وردٍ
 * يُتمّ؛ carryOut = ما بقي (سقف ١، فلا يُعرض أكثر من فائتٍ واحد). الحالة: صفرٌ بعذرٍ ⟵ EXCUSED،
 * صفرٌ بلا عذرٍ ⟵ SHORTFALL، إتمامٌ كاملٌ لِما عُرض ⟵ MADE_UP (إن كان فيه فائت) أو COMPLETE،
 * إتمامٌ جزئيّ ⟵ COMPLETE (ورد اليوم أُدّي والجدول يتأخّر). اليوم الجاري (open) ⟵ OPEN.
 */
export function foldWardDays(entries: readonly WardDayEntry[], startPointer: number = 0): WardFold {
  const ordered = [...entries].sort((a, b) => a.dayDate.localeCompare(b.dayDate));
  let pointer = startPointer;
  let carry = 0;
  const days: WardDayResult[] = [];
  for (const e of ordered) {
    const shown = Math.min(2, carry + 1);
    const completed = Math.max(0, Math.min(e.completed, shown));
    pointer += completed;
    const carryOut = Math.min(1, shown - completed);
    let status: WardDayStatus;
    if (e.open && completed < shown) status = "OPEN";
    else if (completed === 0) status = e.excused ? "EXCUSED" : "SHORTFALL";
    else if (completed >= shown) status = carry > 0 ? "MADE_UP" : "COMPLETE";
    else status = "COMPLETE"; // أدّى ورد اليوم، وبقي فائتٌ ⟵ الجدول يتأخّر
    days.push({ dayDate: e.dayDate, shown, completed, carryOut, pointerAfter: pointer, status });
    carry = carryOut;
  }
  return { days, pointer, carry };
}
