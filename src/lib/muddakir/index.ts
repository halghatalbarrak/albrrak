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
export { foldDay, faceCounter, type FoldEvent, type FaceCounters, type DayFoldResult } from "./day-fold";
export { buildEvent, toFoldEvent, browserDeps, type DeviceEventInput, type BuildDeps } from "./event-build";
export { EventQueue, MemoryQueueStore, type QueuedEvent, type QueueStore, type Sender } from "./event-queue";
