// نافذة الربط (§٤٫٢): كل ما حُفظ في آخر N يوماً بحسب المسار (وجه=٢٠، وجهان=١٥، ثلاثة=١٠ ⚙)،
// سوى وجه الأمس (فهو في «تكرار الأمس»)، ويُقرأ بترتيب المصحف. قاعدةٌ حاكمة: لا يخرج الوجه من
// الربط إلى المراجعة إلا بعد أن يسمعه المشرف (HEARD)، ولو تجاوز نافذة الأيّام. كل الأرقام من Setting.

import { dayDiff } from "./makkah-day";
import type { FaceStateInput, ProfileInput } from "./types";

/**
 * أوجه الربط ليومٍ ما، بترتيب المصحف (تصاعديّاً بالصفحة).
 * @param profile ملفّ الحافظ (المسار منه).
 * @param faces حالات أوجه الحافظ.
 * @param today اليوم القرآنيّ (YYYY-MM-DD بتوقيت مكّة).
 * @param windowByTrack نافذة الربط بحسب المسار، من Setting (مثال {"1":20,"2":15,"3":10}).
 */
export function ribatWindow(
  profile: ProfileInput,
  faces: readonly FaceStateInput[],
  today: string,
  windowByTrack: Record<string, number>,
): FaceStateInput[] {
  const windowDays = windowByTrack[String(profile.track)];
  if (windowDays == null) throw new Error(`لا نافذة ربطٍ للمسار ${profile.track} في الإعدادات`);

  const selected = faces.filter((f) => {
    if (f.firstMemorizedOn == null) return false; // لم يُحفظ بعد
    if (f.state === "IN_REVIEW") return false; // خرج إلى المراجعة
    const age = dayDiff(today, f.firstMemorizedOn);
    if (age < 2) return false; // اليوم (جديد) والأمس (تكرار الأمس) ليسا ربطاً
    // داخل النافذة ⟵ ربط. خارجها: يبقى ربطاً ما لم يُسمَع بعدُ (القاعدة الحاكمة)؛
    // فإن سُمِع وتجاوز النافذة فقد انتقل إلى المراجعة.
    return age <= windowDays || !f.heard;
  });

  return selected.sort((a, b) => a.page - b.page);
}
