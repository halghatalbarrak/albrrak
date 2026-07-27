import { ProgramKey } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ValidationError } from "../errors";
import {
  DEFAULT_MILESTONE_FAILURE_ACTION,
  getMilestoneFailureAction,
  setMilestoneFailureAction,
} from "../settings";
import { createProgram, createUser } from "../testing/factories";
import { prisma, resetDb } from "../testing/helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("إعدادات البرنامج — إجراء إخفاق المحطة (§٧٫٥)", () => {
  it("الافتراضي RESET_TO_ZERO حين لا إعداد", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    expect(await getMilestoneFailureAction(program.id, prisma)).toBe("RESET_TO_ZERO");
    expect(DEFAULT_MILESTONE_FAILURE_ACTION).toBe("RESET_TO_ZERO");
  });

  it("يُضبط وقت التشغيل (بلا نشر) ويُقرأ", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const actor = await createUser(prisma);
    await setMilestoneFailureAction(program.id, "REPAIR", actor.id, prisma);
    expect(await getMilestoneFailureAction(program.id, prisma)).toBe("REPAIR");
    expect(await prisma.event.count({ where: { type: "SETTING_CHANGED" } })).toBe(1);
  });

  it("إعدادٌ منفصلٌ لكل برنامج (مراقي يبقى على الافتراضي)", async () => {
    const madaniyyah = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const maraqi = await createProgram(prisma, ProgramKey.MARAQI);
    const actor = await createUser(prisma);
    await setMilestoneFailureAction(madaniyyah.id, "REPAIR", actor.id, prisma);
    expect(await getMilestoneFailureAction(madaniyyah.id, prisma)).toBe("REPAIR");
    expect(await getMilestoneFailureAction(maraqi.id, prisma)).toBe("RESET_TO_ZERO");
  });

  it("قيمة غير معروفة ← ValidationError", async () => {
    const program = await createProgram(prisma, ProgramKey.QAIDAH_MADANIYYAH);
    const actor = await createUser(prisma);
    await expect(
      // @ts-expect-error قيمة غير مسموحة عمدًا
      setMilestoneFailureAction(program.id, "NOPE", actor.id, prisma),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
