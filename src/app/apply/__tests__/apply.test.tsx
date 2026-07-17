// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import ApplyPage from "../page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
  const res = { ok: status < 400, status, json: async () => body } as unknown as Response;
  global.fetch = vi.fn(async () => res) as unknown as typeof fetch;
}

describe("/apply تُصيّر بلا انهيار مهما رجع المسار", () => {
  it("المسار يرجع 500 ← رسالة خطأ صريحة، لا `.map على undefined`", async () => {
    mockFetch(500, { error: "خطأ داخلي" });
    render(<ApplyPage />);
    await waitFor(() =>
      expect(screen.getByText(/تعذّر تحميل النموذج/)).toBeTruthy(),
    );
  });

  it("قائمة فارغة ← النموذج يظهر مع تنبيه، بلا انهيار", async () => {
    mockFetch(200, { nationalities: [], schoolStages: [] });
    render(<ApplyPage />);
    await waitFor(() =>
      expect(screen.getByText(/قوائم الجنسيات غير متاحة/)).toBeTruthy(),
    );
  });

  it("بيانات صحيحة ← تظهر الجنسية في النموذج", async () => {
    mockFetch(200, {
      nationalities: [{ id: "n1", nameAr: "سعودي" }],
      schoolStages: [{ id: "s1", nameAr: "ابتدائي" }],
    });
    render(<ApplyPage />);
    await waitFor(() => expect(screen.getByText("سعودي")).toBeTruthy());
  });
});
