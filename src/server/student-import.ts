import { type Gender, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { computeAge } from "./age-policy";
import { submitApplication, acceptApplication } from "./application";
import { enrollStudent } from "./enrollment";
import { verr } from "./errors";
import { type AuthProvider, defaultAuthProvider } from "./auth-provider";
import { decryptNationalId, maskNationalId } from "./national-id";
import { IMPORT_COLUMNS, type ColumnKey } from "@/lib/student-import-columns";

// ═══ استيراد الطلاب دفعةً واحدة (CSV) ═══
// وحدةٌ نقيّةٌ للتحليل والتحقّق (تُختبَر بلا شبكة ولا قاعدة) + منسّقٌ للحفظ يعيد استعمال
// دوالّ الإنشاء القائمة (submitApplication ← acceptApplication ← enrollStudent) فتنطبق كلّ
// القواعد. لا بيانات طلابٍ هنا؛ القالب أعمدةٌ فحسب. رقم الهوية لا يُطبَع ولا يُسجَّل كاملاً.

export { IMPORT_COLUMNS, type ColumnKey } from "@/lib/student-import-columns";
export type RawRow = Record<ColumnKey, string>;

/** رمز العلّة — تُترجمه الواجهة (لا نصّ خام من الخادم). */
export type IssueCode =
  | "idNot10"
  | "nationalityUnmatched"
  | "relationUnmatched"
  | "emergencyRelationUnmatched"
  | "missingName"
  | "missingNationality"
  | "missingBirthDate"
  | "badBirthDate"
  | "missingStudentGender"
  | "badStudentGender"
  | "missingGuardianGender"
  | "badGuardianGender"
  | "missingGuardianRelation"
  | "missingGuardianPhone"
  | "teenNeedsPhone"
  | "dupInFile"
  | "dupInDb";

export type RowLevel = "valid" | "warning" | "error";

export interface RowIssue {
  code: IssueCode;
  level: "warning" | "error";
  /** عمود القالب المعنيّ (لإبراز الخلل في المعاينة). */
  column?: ColumnKey;
}

/** مُدخَلٌ محلولٌ جاهزٌ لـsubmitApplication (بلا أعمدة الطوارئ الناقصة — سُدَّت من الوليّ). */
export interface ResolvedInput {
  nameAsInId: string;
  nationalId: string;
  nationalityId: string;
  birthDate: Date;
  gender: Gender;
  guardianPhone: string;
  guardianGender: Gender;
  guardianRelationId: string;
  studentPhone: string | null;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationId: string;
  priorHifzNotes: string | null;
}

export interface RowResult {
  /** فهرس السطر في الملفّ (بدءًا من ١ للبيانات، لا الترويسة). */
  index: number;
  level: RowLevel;
  issues: RowIssue[];
  /** الاسم كما في الملفّ — لعرض السطر. */
  name: string;
  /** رقم الهوية محجوبًا (آخر ٤ خانات) — لا يُكشَف كاملًا أبدًا. */
  maskedId: string;
  /** المُدخَل المحلول — موجودٌ فقط حين level ≠ "error". */
  resolved?: ResolvedInput;
}

export interface ReferenceItem {
  id: string;
  nameAr: string;
}

export interface ValidationContext {
  nationalities: ReferenceItem[];
  guardianRelations: ReferenceItem[];
  /** مجموعة مفاتيح أرقام الهويّة الموجودة في القاعدة (محلولة ومطبَّعة) — لكشف التكرار. */
  existingIdKeys: Set<string>;
  /** تجاوزٌ يدويٌّ من المعاينة: فهرس السطر ← مُعرّفاتٌ اختارها المستخدم. */
  overrides?: Record<number, { nationalityId?: string; guardianRelationId?: string; emergencyRelationId?: string }>;
  asOf?: Date;
}

// ── تطبيع ──

const EASTERN = "٠١٢٣٤٥٦٧٨٩";
/** يحوّل الأرقام المشرقية إلى غربية (للتحليل الداخليّ فقط؛ العرض يبقى مشرقيًّا). */
export function toWesternDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(EASTERN.indexOf(d)));
}

/** تطبيعٌ للمطابقة: يزيل التشكيل والتطويل، ويوحّد الهمزات والتاء المربوطة والألف المقصورة، ويطوي المسافات. */
export function normalizeArabic(s: string): string {
  return (s ?? "")
    .replace(/[ً-ْٰ]/g, "") // تشكيل
    .replace(/ـ/g, "") // تطويل
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\S]+/g, " ")
    .trim()
    .toLowerCase();
}

/** يُسقط «ال» التعريف من البداية — فيُطابَق «الأب» و«اب». */
function stripAl(s: string): string {
  return s.startsWith("ال") ? s.slice(2) : s;
}

// مرادفاتٌ بسيطة (مطبَّعة) ← القيمة المرجعيّة المطبَّعة.
const NATIONALITY_SYNONYMS: Record<string, string> = {
  "سعودي": "السعوديه",
  "سعوديه": "السعوديه",
};
const RELATION_SYNONYMS: Record<string, string> = {
  "اب": "الاب",
  "والد": "الاب",
  "والده": "الاب", // «والده» شائعةٌ بمعنى الأب (أبوه)
  "ابوه": "الاب",
  "ام": "الام",
  "والدته": "الام",
  "اخ": "الاخ",
  "اخو": "الاخ",
  "عم": "العم",
  "خال": "الخال",
  "جد": "الجد",
};

/** يطابق نصًّا حرًّا مع قيمةٍ مرجعيّة (بعد التطبيع والمرادفات وإسقاط «ال»). null إن لم يُطابَق. */
export function matchReference(
  raw: string,
  items: ReferenceItem[],
  synonyms: Record<string, string> = {},
): ReferenceItem | null {
  const n = normalizeArabic(raw);
  if (!n) return null;
  const canon = synonyms[n] ?? n;
  const target = stripAl(canon);
  for (const it of items) {
    const itn = normalizeArabic(it.nameAr);
    if (itn === canon || stripAl(itn) === target) return it;
  }
  return null;
}

/** يحلّل الجنس (ذكر/أنثى) — null إن فارغًا، undefined إن غير مفهوم. */
export function parseGender(raw: string): Gender | null | undefined {
  const n = normalizeArabic(raw);
  if (!n) return null;
  if (["ذكر", "ذ", "male", "m", "ولد", "رجل"].includes(n)) return "MALE";
  if (["انثي", "انثى", "ف", "female", "f", "بنت", "امراه"].includes(n)) return "FEMALE";
  return undefined;
}

/** يحلّل تاريخ ميلادٍ ميلاديّ (يقبل الأرقام المشرقية والفواصل - / .). null إن تعذّر. */
export function parseBirthDate(raw: string): Date | null {
  const s = toWesternDigits((raw ?? "").trim());
  if (!s) return null;
  const parts = s.split(/[\/\-.\s]+/).filter(Boolean).map((p) => Number(p));
  if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p))) return null;
  let y: number, m: number, d: number;
  if (String(parts[0]).length === 4) [y, m, d] = parts; // YYYY M D
  else [d, m, y] = parts; // D M YYYY
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** مفتاح مقارنة رقم الهويّة (أرقامٌ غربية، بلا مسافات) — لكشف التكرار. */
export function nationalIdKey(raw: string): string {
  return toWesternDigits((raw ?? "").trim()).replace(/\s+/g, "");
}

// ── تحليل CSV ──

/** محلّل CSV أدنى: يدعم BOM والاقتباس المزدوج والفواصل وأسطر CRLF/LF. يُرجع صفوف خلايا. */
export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\r") { /* يُتجاهل — يُعالَج \n */ }
    else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
    else field += c;
  }
  if (field !== "" || cur.length) { cur.push(field); rows.push(cur); }
  // أسقط الأسطر الفارغة تمامًا.
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export interface ParseResult {
  ok: boolean;
  /** أعمدةٌ ناقصةٌ في الترويسة (أسماؤها العربية) — إن وُجدت فـok=false. */
  missingColumns: string[];
  rows: RawRow[];
}

/** يحوّل نصّ CSV إلى صفوفٍ خامٍّ مفهرسةٍ بمفاتيح الأعمدة، بعد التحقّق من الترويسة. */
export function parseStudentsCsv(text: string): ParseResult {
  const grid = parseCsv(text);
  if (grid.length === 0) return { ok: false, missingColumns: IMPORT_COLUMNS.map((c) => c.ar), rows: [] };
  const header = grid[0].map((h) => normalizeArabic(h));
  const colIndex = new Map<ColumnKey, number>();
  const missing: string[] = [];
  for (const col of IMPORT_COLUMNS) {
    const want = normalizeArabic(col.ar);
    const idx = header.findIndex((h) => h === want || h.startsWith(want));
    if (idx === -1) missing.push(col.ar);
    else colIndex.set(col.key, idx);
  }
  if (missing.length) return { ok: false, missingColumns: missing, rows: [] };
  const rows: RawRow[] = grid.slice(1).map((cells) => {
    const row = {} as RawRow;
    for (const col of IMPORT_COLUMNS) row[col.key] = (cells[colIndex.get(col.key)!] ?? "").trim();
    return row;
  });
  return { ok: true, missingColumns: [], rows };
}

/**
 * مجموعة مفاتيح أرقام الهويّة الموجودة (القيود + سجلّات الأشخاص) — تُفكّ في الذاكرة على
 * الخادم لكشف التكرار، **ولا تُسجَّل ولا تُعاد إلى المتصفّح**. البيانات صغيرةٌ فالفكّ مقبول.
 * عمودٌ حتميّ (HMAC) لرقم الهويّة يُغني عن هذا لاحقًا — انظر HANDOFF.md.
 */
export async function loadExistingIdKeys(db: PrismaClient = prisma): Promise<Set<string>> {
  const [apps, users] = await Promise.all([
    db.application.findMany({ select: { nationalIdEnc: true } }),
    db.user.findMany({ where: { nationalId: { not: null } }, select: { nationalId: true } }),
  ]);
  const keys = new Set<string>();
  const add = (enc: string | null | undefined) => {
    if (!enc) return;
    try { keys.add(nationalIdKey(decryptNationalId(enc))); } catch { /* سجلّ تالفٌ يُتجاوَز */ }
  };
  for (const a of apps) add(a.nationalIdEnc);
  for (const u of users) add(u.nationalId);
  return keys;
}

// ── التحقّق والحلّ ──

/** يتحقّق من صفٍّ خامٍّ ويحلّه — يحدّد المستوى والعلل، ويكشف التكرار (داخل الملفّ وفي القاعدة). */
export function validateRows(rows: RawRow[], ctx: ValidationContext): RowResult[] {
  const asOf = ctx.asOf ?? new Date();
  const seenInFile = new Set<string>();
  return rows.map((row, i) => {
    const index = i + 1;
    const issues: RowIssue[] = [];
    const ov = ctx.overrides?.[index] ?? {};
    const name = row.studentName.trim();
    const idKey = nationalIdKey(row.nationalId);

    if (!name) issues.push({ code: "missingName", level: "error", column: "studentName" });

    // رقم الهوية: الفراغ خطأ؛ وغير العشرة أرقام تحذيرٌ لا خطأ (جوازات السفر).
    if (!idKey) issues.push({ code: "idNot10", level: "error", column: "nationalId" });
    else if (!/^\d{10}$/.test(idKey)) issues.push({ code: "idNot10", level: "warning", column: "nationalId" });

    // الجنسية: تجاوزٌ يدويّ، وإلا مطابقةٌ بالاسم.
    let nationalityId = ov.nationalityId;
    if (!nationalityId) {
      if (!row.nationality.trim()) issues.push({ code: "missingNationality", level: "error", column: "nationality" });
      else {
        const m = matchReference(row.nationality, ctx.nationalities, NATIONALITY_SYNONYMS);
        if (m) nationalityId = m.id;
        else issues.push({ code: "nationalityUnmatched", level: "error", column: "nationality" });
      }
    }

    const birthDate = parseBirthDate(row.birthDate);
    if (!row.birthDate.trim()) issues.push({ code: "missingBirthDate", level: "error", column: "birthDate" });
    else if (!birthDate) issues.push({ code: "badBirthDate", level: "error", column: "birthDate" });

    const gender = parseGender(row.studentGender);
    if (gender === null) issues.push({ code: "missingStudentGender", level: "error", column: "studentGender" });
    else if (gender === undefined) issues.push({ code: "badStudentGender", level: "error", column: "studentGender" });

    const guardianGender = parseGender(row.guardianGender);
    if (guardianGender === null) issues.push({ code: "missingGuardianGender", level: "error", column: "guardianGender" });
    else if (guardianGender === undefined) issues.push({ code: "badGuardianGender", level: "error", column: "guardianGender" });

    // صلة ولي الأمر.
    let guardianRelationId = ov.guardianRelationId;
    if (!guardianRelationId) {
      if (!row.guardianRelation.trim()) issues.push({ code: "missingGuardianRelation", level: "error", column: "guardianRelation" });
      else {
        const m = matchReference(row.guardianRelation, ctx.guardianRelations, RELATION_SYNONYMS);
        if (m) guardianRelationId = m.id;
        else issues.push({ code: "relationUnmatched", level: "error", column: "guardianRelation" });
      }
    }

    const guardianPhone = row.guardianPhone.trim();
    if (!guardianPhone) issues.push({ code: "missingGuardianPhone", level: "error", column: "guardianPhone" });

    const studentPhone = row.studentPhone.trim() || null;
    // ≥١٣ يلزمه جوالٌ (م٤) وإلا رفضه acceptApplication.
    if (birthDate && computeAge(birthDate, asOf) >= 13 && !studentPhone) {
      issues.push({ code: "teenNeedsPhone", level: "error", column: "studentPhone" });
    }

    // الطوارئ: الفراغ يُؤخَذ من الوليّ (الاسم والصلة والجوال).
    const emergencyName = row.emergencyName.trim() || row.guardianName.trim();
    const emergencyPhone = row.emergencyPhone.trim() || guardianPhone;
    let emergencyRelationId = ov.emergencyRelationId;
    if (!emergencyRelationId) {
      const emgRaw = row.emergencyRelation.trim() || row.guardianRelation.trim();
      const m = emgRaw ? matchReference(emgRaw, ctx.guardianRelations, RELATION_SYNONYMS) : null;
      if (m) emergencyRelationId = m.id;
      else if (guardianRelationId) emergencyRelationId = guardianRelationId; // الصلة نفسها إن تعذّرت المطابقة
      else issues.push({ code: "emergencyRelationUnmatched", level: "error", column: "emergencyRelation" });
    }

    // كشف التكرار: داخل الملفّ أوّلًا، ثم في القاعدة.
    if (idKey) {
      if (seenInFile.has(idKey)) issues.push({ code: "dupInFile", level: "error", column: "nationalId" });
      else {
        seenInFile.add(idKey);
        if (ctx.existingIdKeys.has(idKey)) issues.push({ code: "dupInDb", level: "error", column: "nationalId" });
      }
    }

    const hasError = issues.some((x) => x.level === "error");
    const level: RowLevel = hasError ? "error" : issues.length ? "warning" : "valid";

    const result: RowResult = {
      index,
      level,
      issues,
      name,
      maskedId: idKey ? maskNationalId(idKey) : "",
    };
    if (!hasError && birthDate && gender && guardianGender && nationalityId && guardianRelationId && emergencyRelationId) {
      result.resolved = {
        nameAsInId: name,
        nationalId: row.nationalId.trim(),
        nationalityId,
        birthDate,
        gender,
        guardianPhone,
        guardianGender,
        guardianRelationId,
        studentPhone,
        emergencyName,
        emergencyPhone,
        emergencyRelationId,
        priorHifzNotes: row.hifzAmount.trim() || null,
      };
    }
    return result;
  });
}

// ── الحفظ (يعيد استعمال دوالّ الإنشاء القائمة) ──

/** مزوّدٌ يلفّ الحقيقيّ ويتتبّع ما أنشأه من حسابات Auth — لحذف اليتيم عند فشل السطر. */
function trackingProvider(base: AuthProvider): { provider: AuthProvider; rollback: () => Promise<void> } {
  const created: string[] = [];
  return {
    provider: {
      async createAuthUser(args) {
        const r = await base.createAuthUser(args);
        created.push(r.authId);
        return r;
      },
      setPassword: (a) => base.setPassword(a),
      deleteAuthUser: (a) => base.deleteAuthUser(a),
    },
    async rollback() {
      for (const authId of created.splice(0)) {
        try { await base.deleteAuthUser({ authId }); } catch { /* تعويضٌ أفضل جهد */ }
      }
    },
  };
}

export interface CommitRowOutcome {
  index: number;
  name: string;
  maskedId: string;
  ok: boolean;
  /** رمز الفشل (مفتاح خطأ الخادم أو علّة) — تترجمه الواجهة. */
  reasonKey?: string;
}

export interface CommitReport {
  successCount: number;
  failCount: number;
  outcomes: CommitRowOutcome[];
}

/**
 * يحفظ السطور الصالحة في الحلقة المختارة: لكلّ سطرٍ على حِدَة
 * submitApplication ← acceptApplication ← enrollStudent، بعزلٍ فلا يُفسد سطرٌ فاشل غيرَه.
 * عند فشلٍ بعد إنشاء حساب Auth ⟵ يُحذف الحساب اليتيم (تعويض). لا يُطبَع رقم هويّة.
 */
export async function commitImport(
  args: { rows: RowResult[]; circleId: string; decidedBy: string; asOf?: Date },
  db: PrismaClient = prisma,
  baseProvider: AuthProvider = defaultAuthProvider,
): Promise<CommitReport> {
  const circle = await db.circle.findUnique({ where: { id: args.circleId }, select: { id: true } });
  if (!circle) throw verr("circleNotFound");

  const outcomes: CommitRowOutcome[] = [];
  for (const row of args.rows) {
    if (!row.resolved) {
      outcomes.push({ index: row.index, name: row.name, maskedId: row.maskedId, ok: false, reasonKey: "rowInvalid" });
      continue;
    }
    const { provider, rollback } = trackingProvider(baseProvider);
    try {
      const app = await submitApplication(row.resolved, db);
      let studentId: string;
      try {
        const res = await acceptApplication({ applicationId: app.id, decidedBy: args.decidedBy, asOf: args.asOf }, db, provider);
        studentId = res.studentId;
      } catch (e) {
        await rollback(); // حساب Auth يتيمٌ إن فشلت معاملة القبول بعد إنشائه
        throw e;
      }
      await enrollStudent({ studentId, circleId: args.circleId, actorId: args.decidedBy }, db);
      outcomes.push({ index: row.index, name: row.name, maskedId: row.maskedId, ok: true });
    } catch (e) {
      const reasonKey = (e as { key?: string }).key ?? "importRowFailed";
      outcomes.push({ index: row.index, name: row.name, maskedId: row.maskedId, ok: false, reasonKey });
    }
  }
  const successCount = outcomes.filter((o) => o.ok).length;
  return { successCount, failCount: outcomes.length - successCount, outcomes };
}
