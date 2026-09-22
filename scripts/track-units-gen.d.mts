// أنواع منطق توليد وحدات المسارات (لِـtsc حين يستورده اختبار vitest).

export interface LineRow {
  page: number;
  lineNo: number;
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
}

export interface GeneratedUnit {
  unitNo: number;
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
}

export const SURAH_AYAH_COUNTS: number[];
export const MARAQI_SURAH_ORDER: number[];
export function generateTrackUnits(lines: LineRow[], linesPerDay: number): GeneratedUnit[];
