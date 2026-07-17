// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ApplyPage from "../page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
  const res = { ok: status < 400, status, json: async () => body } as unknown as Response;
  global.fetch = vi.fn(async () => res) as unknown as typeof fetch;
}

/** يملأ تاريخ الميلاد (الخطوة ١) ثم ينتقل إلى الخطوة ٢. */
async function toStepTwo(birthDate: string) {
  const date = await screen.findByLabelText(/تاريخ الميلاد/);
  fireEvent.change(date, { target: { value: birthDate } });
  fireEvent.click(screen.getByText("التالي"));
}

describe("/apply — نموذجٌ من خطوتين، بلا انهيار مهما رجع المسار", () => {
  it("المسار يرجع 500 ← رسالة خطأ صريحة، لا `.map على undefined`", async () => {
    mockFetch(500, { error: "خطأ داخلي" });
    render(<ApplyPage />);
    await waitFor(() =>
      expect(screen.getByText(/تعذّر تحميل النموذج/)).toBeTruthy(),
    );
  });

  it("قائمة فارغة ← الخطوة ٢ تُظهر تنبيهًا، بلا انهيار", async () => {
    mockFetch(200, { nationalities: [], schoolStages: [], guardianRelations: [] });
    render(<ApplyPage />);
    await toStepTwo("2000-01-01");
    await waitFor(() =>
      expect(screen.getByText(/قوائم الجنسيات غير متاحة/)).toBeTruthy(),
    );
  });

  it("بالغ (١٣+) ← خطابُ «الطالب يعبّئ» + الجنسية في قائمة البحث", async () => {
    mockFetch(200, {
      nationalities: [{ id: "n1", nameAr: "السعودية" }],
      schoolStages: [{ id: "s1", nameAr: "ابتدائي" }],
      guardianRelations: [{ id: "r1", nameAr: "أب" }],
    });
    const { container } = render(<ApplyPage />);
    await toStepTwo("2000-01-01");
    await waitFor(() => expect(screen.getByText(/الطالب هو من يعبّئ بياناته/)).toBeTruthy());
    // الجنسية combobox بالبحث (datalist) ⟵ خيارٌ بقيمة الاسم.
    expect(container.querySelector('option[value="السعودية"]')).toBeTruthy();
  });

  it("دون ١٣ ← خطابُ «على ولي الأمر تعبئة البيانات»", async () => {
    mockFetch(200, {
      nationalities: [{ id: "n1", nameAr: "السعودية" }],
      schoolStages: [],
      guardianRelations: [{ id: "r1", nameAr: "أب" }],
    });
    render(<ApplyPage />);
    await toStepTwo("2016-01-01");
    await waitFor(() =>
      expect(screen.getByText(/دون الثالثة عشرة/)).toBeTruthy(),
    );
  });
});
