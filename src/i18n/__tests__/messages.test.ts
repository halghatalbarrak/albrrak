import { describe, expect, it } from "vitest";

import { messagesAr, tMessages } from "../ar/messages";

describe("قاموس صفحة الرسائل (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tMessages("badgeNew")).toBe("جديدة");
    expect(tMessages("badgeAbsence")).toBe("غياب");
  });

  it("لا مفتاحٍ بقيمةٍ فارغة", () => {
    for (const [key, value] of Object.entries(messagesAr)) {
      expect(value, key).not.toBe("");
    }
  });
});
