import { Gender } from "@prisma/client";
import { type ApplicationInput } from "./application";
import { ValidationError } from "./errors";

function str(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new ValidationError(`حقل مطلوب أو غير صالح: ${field}`);
  }
  return v.trim();
}

function optStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function gender(v: unknown, field: string): Gender {
  if (v === Gender.MALE || v === Gender.FEMALE) return v;
  throw new ValidationError(`جنس غير صالح: ${field}`);
}

/** يتحقّق من جسم نموذج القيد العام ويحوّله إلى ApplicationInput، أو يرمي ValidationError. */
export function parseApplicationInput(body: unknown): ApplicationInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("جسم الطلب غير صالح.");
  }
  const b = body as Record<string, unknown>;

  const birthMs = Date.parse(str(b.birthDate, "birthDate"));
  if (Number.isNaN(birthMs)) {
    throw new ValidationError("تاريخ ميلاد غير صالح.");
  }

  let priorHifzJuz: number | null = null;
  if (b.priorHifzJuz !== undefined && b.priorHifzJuz !== null && b.priorHifzJuz !== "") {
    const n = Number(b.priorHifzJuz);
    if (!Number.isInteger(n) || n < 0 || n > 30) {
      throw new ValidationError("مقدار الحفظ (بالأجزاء) غير صالح.");
    }
    priorHifzJuz = n;
  }

  return {
    nameAsInId: str(b.nameAsInId, "nameAsInId"),
    nationalId: str(b.nationalId, "nationalId"),
    nationalityId: str(b.nationalityId, "nationalityId"),
    birthDate: new Date(birthMs),
    gender: gender(b.gender, "gender"),
    schoolStageId: optStr(b.schoolStageId),
    guardianPhone: str(b.guardianPhone, "guardianPhone"),
    guardianGender: gender(b.guardianGender, "guardianGender"),
    studentPhone: optStr(b.studentPhone),
    priorHifzJuz,
    priorHifzNotes: optStr(b.priorHifzNotes),
    preferredCircleId: optStr(b.preferredCircleId),
  };
}
