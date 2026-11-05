import { DisplayAssetType, DisplayScreenKind, Role } from "@prisma/client";

import { requireRoles } from "@/server/auth";
import { uploadPublicAsset } from "@/server/storage";
import { addBackground, addImageSlide, assertDisplayAdmin } from "@/server/display/admin";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";

const ADMIN: Role[] = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4" };
const MAX = 25 * 1024 * 1024; // ٢٥ ميغا

// POST /api/admin/display/upload — رفعٌ متعدّد الأجزاء: صورة شريحة (target=slide&screenId) أو
// خلفيّة نوع شاشة (target=background&screenKind). يرفع الأصل ويُنشئ السجلّ ويعيد الرابط.
export async function POST(req: Request) {
  try {
    const actor = await requireRoles(req, ADMIN);
    await assertDisplayAdmin(actor.id);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw verr("displayFileRequired");
    const ct = file.type;
    const ext = EXT[ct];
    if (!ext) throw verr("displayFileTypeUnsupported");
    if (file.size > MAX) throw verr("displayFileTooBig");
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadPublicAsset(buffer, { contentType: ct, ext });

    const target = form.get("target");
    if (target === "slide") {
      const screenId = String(form.get("screenId") ?? "");
      if (!screenId) throw verr("displayScreenRequired");
      const durationSec = Number(form.get("durationSec")) || undefined;
      const slide = await addImageSlide(actor.id, screenId, url, durationSec);
      return Response.json({ url, slideId: slide.id }, { status: 201 });
    }
    if (target === "background") {
      const screenKind = String(form.get("screenKind") ?? "");
      if (screenKind !== "MOSQUE" && screenKind !== "HOME") throw verr("displayScreenKindRequired");
      const assetType = ct.startsWith("video/") ? DisplayAssetType.VIDEO : DisplayAssetType.IMAGE;
      const bg = await addBackground(actor.id, screenKind as DisplayScreenKind, url, assetType);
      return Response.json({ url, backgroundId: bg.id }, { status: 201 });
    }
    throw verr("displayTargetRequired");
  } catch (e) {
    return errorResponse(e);
  }
}
