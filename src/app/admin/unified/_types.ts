import { supabaseBrowser } from "@/lib/supabase-browser";

export interface Bound {
  fromSurah: number; fromAyah: number; toSurah: number; toAyah: number;
  sessionId?: string | null;
  savedErrors?: number;
}
export interface NewHifz { kind: "NEW" | "REPEAT" | "COMPLETED" | "NO_TRACK"; bound?: Bound }
export interface Target {
  status: "ACTIVE" | "ON_LEAVE" | "NOT_MARAQI" | "INACTIVE";
  newHifz: NewHifz | null;
  tarseekh: Bound[];
  murajaah: { dayNo: number | null; totalStock: number; todaySlice: Bound[] } | null;
  hasTarsikh: boolean;
  hasMuraja: boolean;
}
export interface Qaidah {
  started: boolean; graduated: boolean; deferred: boolean;
  todayResult: "MASTERED" | "NOT_MASTERED" | "DEFERRED" | null;
  consecutiveDeferrals: number; locked: boolean;
  chapterName: string | null; lessonName: string | null;
  lessonIndexInChapter: number | null; lessonsInChapter: number | null; percent: number;
}
export interface SetupStatus { isComplete: boolean; blockers: { key: string }[]; warnings: { key: string }[] }
export interface TrackOption { id: string; nameAr: string; linesPerDay: number; ordinal: number }
export interface Student {
  studentId: string; name: string;
  program: string | null;
  attendanceStatus: string | null;
  todayHifzDone: boolean; tarseekhDone: boolean | null;
  today: Target;
  qaidah: Qaidah | null;
  setupStatus?: SetupStatus;
  stageLabel: string | null;
  hizb: number | null;
  weeklyPercent: number | null;
  weeklyComplete: boolean;
  deferredToday: boolean;
  mustRepeat: boolean;
  started: boolean;
  yesterday: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number; mastered: boolean } | null;
  required: { tarseekhCount: number; khums: number } | null;
}
export interface Circle { id: string; nameAr: string }
export interface GrantItem { id: string; nameAr: string; value: number; grantSource: string }
export type LockState = "OPEN" | "APPROVED" | "AUTO_LOCKED" | "TEMP_OPEN";
export interface DayLock { state: LockState; locked: boolean; date: string }

export type PostFn = (url: string, body: Record<string, unknown>, okMsg: string) => Promise<void>;

export async function token(): Promise<string | null> {
  const { data: { session } } = await supabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}
