import { readFileSync } from "node:fs";
import path from "node:path";

import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";
import QRCode from "qrcode";
import { type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { uploadCertificatePng } from "./storage";

/**
 * مولّد الشهادات — Chromium بلا رأس + قالب HTML/CSS بـ dir="rtl".
 *
 * لماذا Chromium لا Satori (@vercel/og): Satori يضع الكلمات بترتيبها المنطقيّ دون
 * تطبيق خوارزمية bidi، فينعكس ترتيب الكلمات العربية. المتصفّح وحده يرتّب bidi صحيحاً.
 *
 * ⚠️ اعتماد ثقيل: @sparticuz/chromium (~50MB مضغوط brotli → ~170MB وقت التشغيل)،
 * والتوليد يستغرق ثوانٍ (إقلاع بارد ~5s). القرار المعماريّ: **يُولَّد وقت الإصدار
 * (issuance) لا وقت الطلب** — تُخزَّن الصورة وتُقدَّم من التخزين. لا تستدعِ هذا في
 * مسار يُطلب لكل زائر. (تفاصيل في README.)
 *
 * ملاحظة تنفيذية محورية: لا تستخدم screenshot({clip}) مع <html dir="rtl"> — أصل
 * الإحداثيات ينزاح في RTL فتُلتقط منطقة فارغة. نضبط نافذة العرض ونلتقطها كاملةً.
 */

export interface CertificateData {
  /** اسم صاحب الشهادة — «محمد عبدالله القحطاني» */
  recipientName: string;
  /** عنوان الشهادة — «شهادة اجتياز — القاعدة المدنية» */
  title: string;
  /** رقم/رمز التوثيق — يظهر لاتينياً ويُرمَّز في QR */
  token: string;
  /** الرابط الكامل الذي يُرمَّز في رمز QR (مثل https://…/verify/<token>) */
  verifyUrl: string;
  /** سطر المتن (اختياري) — «باجتيازه متطلّبات… بنجاحٍ واقتدار» */
  bodyLine?: string;
  /** اسم الجهة أعلى الشهادة (اختياري) — «منصة حلقات البراك» */
  brand?: string;
}

export interface RenderOptions {
  width?: number;
  height?: number;
  /** مجلّد خطوط IBM Plex Sans Arabic (TTF). الافتراضي: <cwd>/public/fonts */
  fontsDir?: string;
}

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 849;

/** مسار Chrome المحلّي للتطوير (على Vercel/Lambda نستخدم @sparticuz/chromium). */
const LOCAL_CHROME =
  process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fontFace(fontsDir: string, weight: number, file: string): string {
  const b64 = readFileSync(path.join(fontsDir, file)).toString("base64");
  return `@font-face{font-family:'IBM Plex Sans Arabic';font-style:normal;font-weight:${weight};src:url(data:font/ttf;base64,${b64}) format('truetype');}`;
}

/** شعار المنصّة مُضمَّناً (base64) — من public/png/logo.jpeg. */
function logoDataUrl(): string {
  try {
    const b64 = readFileSync(path.join(process.cwd(), "public", "png", "logo.jpeg")).toString("base64");
    return `data:image/jpeg;base64,${b64}`;
  } catch {
    return "";
  }
}

function buildHtml(
  data: CertificateData,
  qrDataUrl: string,
  fontsDir: string,
  width: number,
  height: number,
): string {
  const fonts = [
    fontFace(fontsDir, 400, "IBMPlexSansArabic-Regular.ttf"),
    fontFace(fontsDir, 600, "IBMPlexSansArabic-SemiBold.ttf"),
    fontFace(fontsDir, 700, "IBMPlexSansArabic-Bold.ttf"),
  ].join("");

  const logo = logoDataUrl();
  const brand = `<div class="brand">${esc(data.brand ?? "حلقات الشيخ محمد البراك")}</div>`;
  const bodyLine = data.bodyLine ? `<div class="desc">${esc(data.bodyLine)}</div>` : "";

  // بهوية المنصّة (قرار محمد): خلفيّةٌ كريميّة، إطارٌ برونزيّ، عناوين بالتاوپيّ الأساس.
  return `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
${fonts}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:${width}px;height:${height}px;}
.cert{width:${width}px;height:${height}px;background:#F5F0E8;border:16px solid #A9834F;outline:2px solid #A9834F;outline-offset:-26px;
  padding:60px 72px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;
  font-family:'IBM Plex Sans Arabic',sans-serif;color:#2b2620;}
.head{display:flex;flex-direction:column;align-items:center;gap:18px;}
.logo{width:104px;height:auto;border-radius:14px;}
.brand{font-size:32px;font-weight:700;color:#574F47;}
.body{display:flex;flex-direction:column;align-items:center;text-align:center;}
.title{font-size:52px;font-weight:700;color:#8f6d40;margin-bottom:32px;}
.pre{font-size:26px;color:#7a7167;margin-bottom:18px;}
.name{font-size:62px;font-weight:700;color:#2b2620;}
.desc{font-size:26px;color:#7a7167;margin-top:22px;max-width:${width - 160}px;line-height:1.7;}
.foot{width:100%;display:flex;flex-direction:row;align-items:flex-end;justify-content:space-between;}
.doc{display:flex;flex-direction:column;gap:6px;}
.doc .lbl{font-size:20px;font-weight:600;color:#574F47;}
.token{font-size:19px;color:#7a7167;}
.qr{display:flex;flex-direction:column;align-items:center;gap:8px;}
.qr .cap{font-size:15px;color:#7a7167;}
</style></head>
<body><div class="cert">
  <div class="head">${logo ? `<img class="logo" src="${logo}" alt="" />` : ""}${brand}</div>
  <div class="body">
    <div class="title">${esc(data.title)}</div>
    <div class="pre">نشهد بأنّ</div>
    <div class="name">${esc(data.recipientName)}</div>
    ${bodyLine}
  </div>
  <div class="foot">
    <div class="doc"><div class="lbl">رقم التوثيق</div><div class="token" dir="ltr">${esc(data.token)}</div></div>
    <div class="qr"><img src="${qrDataUrl}" width="140" height="140" alt="QR"/><div class="cap">للتحقّق امسح الرمز</div></div>
  </div>
</div></body></html>`;
}

/** يبني HTML الشهادة كاملاً (QR + خطوط + شعار مُضمَّنة) — يُشارَك بين الرسم والمعاينة. */
export async function buildCertificateHtml(data: CertificateData, options: RenderOptions = {}): Promise<string> {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const fontsDir = options.fontsDir ?? path.join(process.cwd(), "public", "fonts");
  const qrDataUrl = await QRCode.toDataURL(data.verifyUrl, { margin: 1, width: 220, color: { dark: "#574F47", light: "#F5F0E8" } });
  return buildHtml(data, qrDataUrl, fontsDir, width, height);
}

async function launchBrowser(width: number, height: number): Promise<Browser> {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
      defaultViewport: { width, height },
    });
  }
  return puppeteer.launch({
    executablePath: LOCAL_CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width, height },
  });
}

/**
 * يولّد صورة شهادة PNG من بيانات الشهادة.
 * ثقيل وبطيء عمداً — استدعِه وقت الإصدار وخزّن الناتج، لا لكل طلب.
 */
export async function renderCertificatePng(
  data: CertificateData,
  options: RenderOptions = {},
): Promise<Buffer> {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const fontsDir = options.fontsDir ?? path.join(process.cwd(), "public", "fonts");

  const html = await buildCertificateHtml(data, { width, height, fontsDir });

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser(width, height);
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    // كل الموارد مُضمَّنة (خطوط base64 + QR data URL) فلا طلبات شبكة — "load" يكفي.
    await page.setContent(html, { waitUntil: "load" });
    // انتظر تحميل الخطوط ثم إطارَي رسم — وإلا التُقطت الصفحة قبل أول رسم (فراغ أبيض).
    await page.evaluate(async () => {
      await (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready;
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    });
    await new Promise((r) => setTimeout(r, 200));
    // لا clip مع dir="rtl" — النافذة مضبوطة على width×height فاللقطة الكاملة هي الصحيحة.
    const png = await page.screenshot({ type: "png" });
    return Buffer.from(png);
  } finally {
    if (browser) await browser.close();
  }
}

// ═══════════════ الإصدار الكسول + التخزين (م٥ + الفكرة ١٠) ═══════════════

const CERT_TITLE: Record<string, string> = {
  KHATM: "شهادة ختم القرآن الكريم",
  MAIN_STAGE: "شهادة إتمام مرحلة",
  SUB_STAGE: "شهادة إتمام حزب",
  QAIDAH: "شهادة القاعدة المدنية",
};
const CERT_BODY: Record<string, string> = {
  KHATM: "بإتمامه حفظ القرآن الكريم كاملاً بحمد الله وتوفيقه",
  MAIN_STAGE: "بإتمامه هذه المرحلة من مراقي الحفظ بنجاح",
  SUB_STAGE: "بإتمامه هذا الجزء من محفوظه بنجاح",
  QAIDAH: "بإتمامه القاعدة المدنية في القراءة والتجويد",
};

/**
 * يضمن وجود صورة الشهادة: إن كانت مخزَّنة أعادها؛ وإلا رسمها (كسولٌ عند أول طلب —
 * Chromium ثقيل) ورفعها إلى التخزين وحفظ رابطها. الاعتماد الثقيل على هذا المسار وحده.
 */
export async function ensureCertificateImage(certId: string, db: PrismaClient = prisma): Promise<string> {
  const c = await db.certificate.findUniqueOrThrow({
    where: { id: certId },
    select: { imageUrl: true, verifyToken: true, template: true, isExcellent: true, student: { select: { user: { select: { nameAsInId: true } } } } },
  });
  if (c.imageUrl) return c.imageUrl;

  const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? "https://albrrak.vercel.app").replace(/\/$/, "");
  const bodyBase = CERT_BODY[c.template] ?? "";
  const png = await renderCertificatePng({
    recipientName: c.student.user.nameAsInId,
    title: CERT_TITLE[c.template] ?? "شهادة",
    token: c.verifyToken,
    verifyUrl: `${appBase}/verify/${c.verifyToken}`,
    bodyLine: c.isExcellent ? `${bodyBase}، نيلاً لمرتبة التميّز.` : `${bodyBase}.`,
    brand: "حلقات الشيخ محمد البراك",
  });
  const url = await uploadCertificatePng(png);
  await db.certificate.update({ where: { id: certId }, data: { imageUrl: url } });
  return url;
}
