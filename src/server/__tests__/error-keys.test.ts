import { describe, expect, it } from "vitest";

import { verr, aerr, authErr, ValidationError } from "../errors";
import { errorResponse } from "../http";
import { errorsAr } from "@/i18n/ar/errors";

// التوطين (PR-1e): أخطاء الخادم المفتاحيّة — النصّ العربيّ حرفاً بحرف + مفتاحٌ في الاستجابة.

describe("مُنشئات الأخطاء المفتاحيّة", () => {
  it("verr/aerr/authErr تبني النصّ من القاموس والمفتاح معاً", () => {
    const e = verr("invalidDate");
    expect(e).toBeInstanceOf(ValidationError);
    expect(e.message).toBe("تاريخ غير صالح."); // حرفاً بحرف
    expect(e.message).toBe(errorsAr.invalidDate);
    expect(e.key).toBe("invalidDate");
    expect(aerr("notAuthorized").key).toBe("notAuthorized");
    expect(authErr("noAuthToken").message).toBe("لا رمز مصادقة.");
  });
});

describe("errorResponse يُصدِّر { error, key } بالحالة الصحيحة", () => {
  it("ValidationError ⟵ 400 بنصّه ومفتاحه", async () => {
    const res = errorResponse(verr("invalidDate"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "تاريخ غير صالح.", key: "invalidDate" });
  });

  it("AuthorizationError ⟵ 403، AuthenticationError ⟵ 401", async () => {
    expect(errorResponse(aerr("notAuthorized")).status).toBe(403);
    expect(errorResponse(authErr("noAuthToken")).status).toBe(401);
  });

  it("قفل اليوم (رسالةٌ مركَّبة) يحمل المفتاح attendanceDayLocked", async () => {
    const res = errorResponse(new ValidationError("اليوم مقفلٌ (معتمَدٌ من المعلّم) — اطلب فتحه لتعديل الرصد.", "attendanceDayLocked"));
    expect(res.status).toBe(400);
    expect((await res.json()).key).toBe("attendanceDayLocked");
  });

  it("خطأٌ غير متوقّع ⟵ 500 بمفتاح internal ونصٍّ عامّ", async () => {
    const res = errorResponse(new Error("boom"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "خطأ داخلي", key: "internal" });
  });
});
