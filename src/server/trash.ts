import { type PrismaClient, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verr } from "./errors";

export type TrashKind = "user" | "circle" | "student";

export interface TrashItem {
  kind: TrashKind;
  id: string;
  label: string;
  deletedAt: Date;
  deletedByName: string | null;
}

export async function listTrashItems(db: PrismaClient = prisma): Promise<TrashItem[]> {
  const [users, circles, students] = await Promise.all([
    db.user.findMany({
      where: { deletedAt: { not: null }, NOT: { roles: { has: Role.STUDENT } } },
      select: { id: true, nameAsInId: true, deletedAt: true, deletedById: true },
      orderBy: { deletedAt: "desc" },
    }),
    db.circle.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, nameAr: true, deletedAt: true, deletedById: true },
      orderBy: { deletedAt: "desc" },
    }),
    db.student.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, deletedAt: true, deletedById: true, user: { select: { nameAsInId: true } } },
      orderBy: { deletedAt: "desc" },
    }),
  ]);

  // جمع معرّفات مَن أجرى الحذف لاستعلامٍ واحد
  const actorIds = new Set<string>();
  for (const u of users) if (u.deletedById) actorIds.add(u.deletedById);
  for (const c of circles) if (c.deletedById) actorIds.add(c.deletedById);
  for (const s of students) if (s.deletedById) actorIds.add(s.deletedById);

  const actorRows = actorIds.size
    ? await db.user.findMany({ where: { id: { in: [...actorIds] } }, select: { id: true, nameAsInId: true } })
    : [];
  const actorMap = new Map(actorRows.map((a) => [a.id, a.nameAsInId]));

  const items: TrashItem[] = [
    ...users.map((u) => ({
      kind: "user" as const,
      id: u.id,
      label: u.nameAsInId,
      deletedAt: u.deletedAt!,
      deletedByName: u.deletedById ? (actorMap.get(u.deletedById) ?? null) : null,
    })),
    ...circles.map((c) => ({
      kind: "circle" as const,
      id: c.id,
      label: c.nameAr,
      deletedAt: c.deletedAt!,
      deletedByName: c.deletedById ? (actorMap.get(c.deletedById) ?? null) : null,
    })),
    ...students.map((s) => ({
      kind: "student" as const,
      id: s.id,
      label: s.user.nameAsInId,
      deletedAt: s.deletedAt!,
      deletedByName: s.deletedById ? (actorMap.get(s.deletedById) ?? null) : null,
    })),
  ];

  return items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
}

export async function restoreItem(
  actorId: string,
  kind: TrashKind,
  itemId: string,
  db: PrismaClient = prisma,
): Promise<void> {
  if (kind === "user") {
    const u = await db.user.findUnique({ where: { id: itemId }, select: { id: true, deletedAt: true } });
    if (!u) throw verr("userNotFound");
    if (!u.deletedAt) throw verr("itemNotDeleted");
    await db.$transaction([
      db.user.update({ where: { id: itemId }, data: { deletedAt: null, deletedById: null, isActive: true } }),
      db.auditLog.create({ data: { action: "UPDATE", entity: "User", entityId: itemId, actorId, label: "restore" } }),
    ]);
  } else if (kind === "circle") {
    const c = await db.circle.findUnique({ where: { id: itemId }, select: { id: true, deletedAt: true } });
    if (!c) throw verr("circleNotFound");
    if (!c.deletedAt) throw verr("itemNotDeleted");
    await db.$transaction([
      db.circle.update({ where: { id: itemId }, data: { deletedAt: null, deletedById: null } }),
      db.auditLog.create({ data: { action: "UPDATE", entity: "Circle", entityId: itemId, actorId, label: "restore" } }),
    ]);
  } else {
    const s = await db.student.findUnique({ where: { id: itemId }, select: { id: true, deletedAt: true } });
    if (!s) throw verr("studentNotFound");
    if (!s.deletedAt) throw verr("itemNotDeleted");
    await db.$transaction([
      db.student.update({ where: { id: itemId }, data: { deletedAt: null, deletedById: null } }),
      db.auditLog.create({ data: { action: "UPDATE", entity: "Student", entityId: itemId, actorId, label: "restore" } }),
    ]);
  }
}

export async function hardDeleteItem(
  actorId: string,
  kind: TrashKind,
  itemId: string,
  db: PrismaClient = prisma,
): Promise<void> {
  if (kind === "user") {
    const u = await db.user.findUnique({
      where: { id: itemId },
      select: { id: true, deletedAt: true, student: { select: { id: true } } },
    });
    if (!u) throw verr("userNotFound");
    if (!u.deletedAt) throw verr("itemNotDeleted");
    if (u.student) throw verr("userHasStudentRecord");
    await db.user.delete({ where: { id: itemId } });
  } else if (kind === "circle") {
    const c = await db.circle.findUnique({ where: { id: itemId }, select: { id: true, deletedAt: true } });
    if (!c) throw verr("circleNotFound");
    if (!c.deletedAt) throw verr("itemNotDeleted");
    const count = await db.enrollment.count({ where: { circleId: itemId } });
    if (count > 0) throw verr("circleHasEnrollments");
    await db.circle.delete({ where: { id: itemId } });
  } else {
    const s = await db.student.findUnique({ where: { id: itemId }, select: { id: true, deletedAt: true } });
    if (!s) throw verr("studentNotFound");
    if (!s.deletedAt) throw verr("itemNotDeleted");
    const count = await db.enrollment.count({ where: { studentId: itemId } });
    if (count > 0) throw verr("studentHasEnrollments");
    await db.student.delete({ where: { id: itemId } });
  }
  await db.auditLog.create({ data: { action: "DELETE", entity: kind, entityId: itemId, actorId, label: "hard-delete" } });
}
