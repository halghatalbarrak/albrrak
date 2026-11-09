import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { suspendEnrollment, resumeEnrollment, expelStudent } from "../enrollment";
import { ValidationError } from "../errors";

// ─── إجراءات الطالب: تعليق / رفع التعليق / فصل ───

describe("suspendEnrollment", () => {
  it("يرمي enrollmentNotFound إن لم يكن للطالب انتساب نشط", async () => {
    await expect(suspendEnrollment("actor-1", "nonexistent-student", "سبب ما", null, prisma))
      .rejects.toMatchObject({ key: "enrollmentNotFound" });
  });
});

describe("resumeEnrollment", () => {
  it("يرمي enrollmentNotFound إن لم يكن للطالب انتساب نشط", async () => {
    await expect(resumeEnrollment("actor-1", "nonexistent-student", prisma))
      .rejects.toMatchObject({ key: "enrollmentNotFound" });
  });
});

describe("expelStudent", () => {
  it("يرمي enrollmentNotFound إن لم يكن للطالب انتساب نشط", async () => {
    await expect(expelStudent("actor-1", "nonexistent-student", "سبب ما", prisma))
      .rejects.toMatchObject({ key: "enrollmentNotFound" });
  });

  it("يستعمل ValidationError لأخطاء القاعدة", async () => {
    await expect(suspendEnrollment("a", "b", "r", null, prisma))
      .rejects.toBeInstanceOf(ValidationError);
  });
});
