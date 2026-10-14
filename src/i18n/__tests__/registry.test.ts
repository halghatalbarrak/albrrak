import { describe, expect, it } from "vitest";

import { t } from "../index";
import { muddakirAr } from "../ar/muddakir";

// سجلّ القواميس (PR-1a): العربية مرجِعٌ، وen/ru فارغان فيرتدّان إليها حرفيّاً بلا تغيّرٍ ظاهر.

describe("سجلّ القواميس — العربية مرجِعٌ وارتدادٌ إليها", () => {
  it("t بالعربية = القاموس العربيّ حرفاً بحرف", () => {
    expect(t("ar", "muddakir", "programName")).toBe(muddakirAr.programName);
    expect(t("ar", "muddakir", "roleHafiz")).toBe("الحافظ");
  });

  it("en وru (فارغان) ⟵ يرتدّان إلى نصّ العربية نفسه", () => {
    expect(t("en", "muddakir", "programName")).toBe(muddakirAr.programName);
    expect(t("ru", "muddakir", "programName")).toBe(muddakirAr.programName);
  });

  it("مفتاحٌ مجهول ⟵ يُعاد المفتاح نفسه (لا انهيار)", () => {
    expect(t("ar", "muddakir", "__nope__")).toBe("__nope__");
  });
});
