// منطق المُدَّكِر النقيّ (المرحلة ٢): دوالّ بلا قاعدةٍ ولا شاشات، كل أرقامها من Setting/المصحف.
export * from "./types";
export { makkahDayDate, makkahDayBounds, dayDiff, epochDay } from "./makkah-day";
export {
  newFacesForDay,
  pageContaining,
  deriveStages,
  stageForPage,
  type MushafFaceData,
  type StageBound,
} from "./mushaf-faces";
export { juzBoundsFromHizb, type HizbRow, type JuzBound } from "./juz-from-hizb";
export { ribatWindow } from "./ribat";
export { reviewSliceForDay, type ReviewFaceInput } from "./review";
