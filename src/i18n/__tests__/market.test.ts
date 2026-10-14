import { describe, expect, it } from "vitest";

import { marketAr, tMarket } from "../ar/market";

describe("قاموس سوق البيدر (العربيّة)", () => {
  it("يستدعى بمفتاح", () => {
    expect(tMarket("pageTitle")).toBe("ثمار البيدر");
    expect(tMarket("colName")).toBe("الثمرة");
    expect(tMarket("newBtn")).toBe("+ جديد");
  });

  it("كلّ مفتاحٍ يُرجع النصّ الأصليّ حرفاً بحرف", () => {
    for (const key of Object.keys(marketAr) as (keyof typeof marketAr)[]) {
      expect(tMarket(key)).toBe(marketAr[key]);
    }
  });

  it("المصطلح الزراعيّ محفوظ (الثمرة/البيدر)", () => {
    expect(tMarket("pageTitle")).toBe("ثمار البيدر");
    expect(tMarket("colName")).toBe("الثمرة");
    expect(tMarket("tableEmpty")).toBe("لا ثمار بعد — أضِف أوّل ثمرة بزرّ «+ جديد».");
  });
});
