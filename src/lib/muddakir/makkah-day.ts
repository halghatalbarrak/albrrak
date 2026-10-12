// يوم المُدَّكِر (§٣): من منتصف الليل إلى منتصف الليل بتوقيت مكّة (Asia/Riyadh)، لا بتوقيت الجهاز.
// نُقلت الدوالّ إلى موضعٍ مشترك (src/lib/makkah-day) لتُستعمل في مراقي كما في المدّكر؛ يُعاد
// تصديرها هنا حفظاً للمسارات القائمة (barrel المدّكر وغيره). مصدرُ الحقيقة الآن الملفّ المشترك.
export { makkahDayDate, makkahDayStart, makkahDayBounds, dayDiff, epochDay } from "@/lib/makkah-day";
