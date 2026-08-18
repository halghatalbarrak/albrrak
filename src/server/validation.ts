import { Gender } from "@prisma/client";
import { type ApplicationInput } from "./application";
import { computeAge } from "./age-policy";
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

/** يجرّد الجوال إلى أرقامه — بها يقع التصادم فعليًّا (البريد الاصطناعي يجرّد \D). */
function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * يتحقّق من جسم نموذج القيد العام ويحوّله إلى ApplicationInput، أو يرمي ValidationError.
 * asOf يُحقن في الاختبار؛ الافتراض «الآن» (شرط جوال ١٣+ محسوبٌ من العمر لا مُدخَل).
 */
export function parseApplicationInput(
  body: unknown,
  asOf: Date = new Date(),
): ApplicationInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("جسم الطلب غير صالح.");
  }
  const b = body as Record<string, unknown>;

  const birthMs = Date.parse(str(b.birthDate, "birthDate"));
  if (Number.isNaN(birthMs)) {
    throw new ValidationError("تاريخ ميلاد غير صالح.");
  }
  const birthDate = new Date(birthMs);
  const age = computeAge(birthDate, asOf);

  let priorHifzJuz: number | null = null;
  if (b.priorHifzJuz !== undefined && b.priorHifzJuz !== null && b.priorHifzJuz !== "") {
    const n = Number(b.priorHifzJuz);
    if (!Number.isInteger(n) || n < 0 || n > 30) {
      throw new ValidationError("مقدار الحفظ (بالأجزاء) غير صالح.");
    }
    priorHifzJuz = n;
  }

  const guardianPhone = str(b.guardianPhone, "guardianPhone");
  const studentPhone = optStr(b.studentPhone);
  const emergencyPhone = str(b.emergencyPhone, "emergencyPhone");

  // بريد الولي — اختياريّ (الفكرة ٩)، وإن وُجد فبصيغةٍ صالحة.
  const guardianEmail = optStr(b.guardianEmail);
  if (guardianEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guardianEmail)) {
    throw new ValidationError("بريد وليّ الأمر غير صالح.");
  }

  // جوال الطالب: اختياري لمن دون ١٣، إلزامي لمن بلغها (فهو شرط الحساب — §٤/م٤).
  if (age >= 13 && !studentPhone) {
    throw new ValidationError(
      "الطالب بلغ الثالثة عشرة: رقم جواله إلزامي (فهو شرط حسابه). يُترك فارغًا لمن دونها فقط.",
    );
  }

  // جوال الطالب ≠ جوال الولي — وإلا اصطدم بحساب الولي (بريدٌ اصطناعيّ واحد) فسقط القبول.
  if (studentPhone && digits(studentPhone) === digits(guardianPhone)) {
    throw new ValidationError(
      "جوال الطالب لا يكون نفس جوال ولي الأمر. اتركه فارغًا إن لم يكن له جوال.",
    );
  }

  // جوال الطوارئ ≠ جوال الولي — فلا نفع لجهةٍ تُطلَب حين لا يردّ الولي وهي جواله نفسه.
  if (digits(emergencyPhone) === digits(guardianPhone)) {
    throw new ValidationError(
      "جوال الطوارئ لا يكون نفس جوال ولي الأمر — فما نفعه حين لا يردّ الولي؟",
    );
  }

  return {
    nameAsInId: str(b.nameAsInId, "nameAsInId"),
    nationalId: str(b.nationalId, "nationalId"),
    nationalityId: str(b.nationalityId, "nationalityId"),
    birthDate,
    gender: gender(b.gender, "gender"),
    schoolStageId: optStr(b.schoolStageId),
    guardianPhone,
    guardianEmail,
    guardianGender: gender(b.guardianGender, "guardianGender"),
    guardianRelationId: str(b.guardianRelationId, "guardianRelationId"),
    studentPhone,
    emergencyName: str(b.emergencyName, "emergencyName"),
    emergencyPhone,
    emergencyRelationId: str(b.emergencyRelationId, "emergencyRelationId"),
    priorHifzJuz,
    priorHifzNotes: optStr(b.priorHifzNotes),
    preferredCircleId: optStr(b.preferredCircleId),
  };
}
