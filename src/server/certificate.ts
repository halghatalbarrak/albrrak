import { readFileSync } from "node:fs";
import path from "node:path";

import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";
import QRCode from "qrcode";
import { type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { hijri } from "@/lib/format";
import { uploadCertificatePng } from "./storage";

/**
 * مولّد الشهادات — Chromium بلا رأس + قالب HTML/CSS بـ dir="rtl".
 *
 * التصميم (إقرار محمد): شهادةٌ عموديّة A4 (نسبة 566×800) بهوية المنصّة — إطارٌ ذهبيّ
 * متدرّج، زوايا مزخرفة، لافتةٌ بنّية، شارةٌ سداسية، ختمٌ وتوقيع، ورمز QR حقيقيّ.
 * قاعدةٌ صارمة: لا نصّ ولا رمز فوق زخارف الزوايا — منطقة المحتوى الآمنة بعيدةٌ عنها.
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

export type CertTemplate = "KHATM" | "MAIN_STAGE" | "SUB_STAGE" | "QAIDAH";

export interface CertificateData {
  /** اسم صاحب الشهادة — «محمد عبدالله القحطاني» */
  recipientName: string;
  /** القالب — يحدّد العنوان ونصّ الإنجاز */
  template: CertTemplate;
  /** وسام التميّز (تسميعٌ نظيف) — يبدّل نصّ الشارة */
  isExcellent: boolean;
  /** رمز التوثيق الكامل — يُرمَّز في QR، ويُعرض مختصراً (أول ٨) على الشهادة */
  token: string;
  /** الرابط الكامل الذي يُرمَّز في رمز QR (مثل https://…/verify/<token>) */
  verifyUrl: string;
  /** تاريخ الإصدار ISO (YYYY-MM-DD) — يُعرض هجرياً */
  issuedAtIso: string;
  /** اسم الجهة (اختياري) — «حلقات الشيخ محمد البراك» */
  brand?: string;
}

export interface RenderOptions {
  width?: number;
  height?: number;
  /** مجلّد خطوط IBM Plex Sans Arabic (TTF). الافتراضي: <cwd>/public/fonts */
  fontsDir?: string;
}

// عموديّ A4 (نسبة 566×800). نرسم بمعامل مقياسٍ ٢ لحدّةٍ أعلى (الناتج 1132×1600).
const DEFAULT_WIDTH = 566;
const DEFAULT_HEIGHT = 800;

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

/** شعار المنصّة مُضمَّناً (base64) — نُفضّل logo.png (خلفية شفّافة) على logo.jpeg. */
function logoDataUrl(): string {
  const candidates: ReadonlyArray<readonly [string, string]> = [
    ["logo.png", "image/png"],
    ["logo.jpeg", "image/jpeg"],
  ];
  for (const [file, mime] of candidates) {
    try {
      const b64 = readFileSync(path.join(process.cwd(), "public", "png", file)).toString("base64");
      return `data:${mime};base64,${b64}`;
    } catch {
      /* جرّب التالي */
    }
  }
  return "";
}

// ── النصوص المتبدّلة بحسب القالب ──
const HEADLINE: Record<CertTemplate, string> = {
  KHATM: "إتمام حفظ القرآن الكريم — برواية حفصٍ عن عاصم",
  MAIN_STAGE: "إتمام مرحلةٍ من مراقي الحفظ — برواية حفصٍ عن عاصم",
  SUB_STAGE: "إتمام حزبٍ من المحفوظ — برواية حفصٍ عن عاصم",
  QAIDAH: "إتمام القاعدة المدنية في القراءة والتجويد",
};
const ACHIEVE: Record<CertTemplate, [string, string]> = {
  KHATM: ["بإتمامه حفظ كتاب الله كاملاً وفق منهج مراقي،", "واجتيازه تسميعه بحمدٍ من الله وتوفيقه."],
  MAIN_STAGE: ["بإتمامه هذه المرحلة من مراقي الحفظ وفق منهجها،", "واجتيازه تسميعها كاملةً بحمد الله."],
  SUB_STAGE: ["بإتمامه هذا الجزء من محفوظه وفق منهج مراقي،", "واجتيازه تسميعه بحمد الله."],
  QAIDAH: ["بإتمامه القاعدة المدنية في القراءة والتجويد،", "واجتيازه اختبارها بنجاحٍ وحمدٍ لله."],
};
const DUA: [string, string] = [
  "نسأل الله أن يجعله من أهل القرآن وخاصّته،",
  "وأن يرزقه العملَ به والثباتَ عليه.",
];

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
  const brand = data.brand ?? "حلقات الشيخ محمد البراك";
  const headline = HEADLINE[data.template];
  const [ach1, ach2] = ACHIEVE[data.template];
  const rank = data.isExcellent ? "التميّز" : "الاجتياز";
  const docNo = data.token.replace(/-/g, "").slice(0, 8).toUpperCase();
  const issued = hijri(data.issuedAtIso);

  const corner = (cls: string) =>
    `<div class="corner ${cls}"><span class="t1"></span><span class="t2"></span></div>`;

  return `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
${fonts}
:root{
  --bg:#FBF8F2; --field:#F5F0E8; --text:#574F47; --muted:#8A7E72; --line:#C9A063;
  --gold:linear-gradient(135deg,#E3C68B,#B08D57,#E8D3A4,#8C6A3D);
  --goldv:linear-gradient(180deg,#E8D3A4,#B08D57,#8C6A3D);
  --brown:linear-gradient(180deg,#6B5B4A,#463D34);
}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:${width}px;height:${height}px;overflow:hidden;}
body{font-family:'IBM Plex Sans Arabic',sans-serif;color:var(--text);}
.page{position:absolute;inset:0;width:${width}px;height:${height}px;background:var(--gold);overflow:hidden;}
.mat{position:absolute;inset:14px;background:var(--bg);}
.f1{position:absolute;inset:22px;border:1.5px solid var(--line);}
.f2{position:absolute;inset:28px;border:1px solid var(--line);}

/* زوايا: مثلّث بنّيّ يعلوه مثلّث ذهبيّ أصغر — عند إطار المحتوى الداخليّ. */
.corner{position:absolute;width:52px;height:52px;}
.corner .t1{position:absolute;inset:0;background:var(--brown);clip-path:polygon(0 0,100% 0,0 100%);}
.corner .t2{position:absolute;top:0;left:0;width:32px;height:32px;background:var(--goldv);clip-path:polygon(0 0,100% 0,0 100%);}
.corner.tl{top:15px;left:15px;transform:rotate(0deg);}
.corner.tr{top:15px;right:15px;transform:rotate(90deg);}
.corner.br{bottom:15px;right:15px;transform:rotate(180deg);}
.corner.bl{bottom:15px;left:15px;transform:rotate(270deg);}

/* منطقة المحتوى الآمنة — بعيدةٌ عن الزوايا بهامشٍ واضح، وموزّعةٌ على كامل الارتفاع. */
.content{position:absolute;inset:42px 52px 54px 52px;display:flex;flex-direction:column;align-items:center;
  justify-content:space-evenly;text-align:center;}
.sec{display:flex;flex-direction:column;align-items:center;width:100%;}

.basmala{font-size:18px;font-weight:700;color:#8C6A3D;margin-bottom:2px;}
.logo{height:100px;width:auto;object-fit:contain;margin-bottom:2px;}

.banner{position:relative;margin:5px 0 1px;background:var(--brown);color:#F3E4C2;
  padding:6px 28px;font-size:22px;font-weight:700;letter-spacing:8px;border-radius:2px;
  box-shadow:0 1px 3px rgba(70,61,52,.3);}
.banner span{padding-inline-start:8px;}
.banner::before,.banner::after{content:"";position:absolute;top:0;bottom:0;width:15px;background:var(--goldv);}
.banner::before{right:-15px;clip-path:polygon(0 0,100% 50%,0 100%);}
.banner::after{left:-15px;clip-path:polygon(100% 0,0 50%,100% 100%);}

.gold{background:linear-gradient(90deg,#8C6A3D,#B08D57,#8C6A3D);-webkit-background-clip:text;background-clip:text;color:transparent;}
.headline{font-size:16.5px;font-weight:700;line-height:1.45;max-width:400px;margin-top:8px;}
.uline{width:120px;height:2px;background:var(--gold);margin:6px auto 0;border-radius:2px;}

.attest{font-size:14px;color:var(--muted);}
.name{background:var(--field);border:1.5px solid var(--line);border-radius:6px;
  padding:8px 28px;margin:6px 0;font-size:30px;font-weight:700;color:#463D34;
  box-shadow:inset 0 0 0 3px var(--bg);max-width:430px;line-height:1.25;}
/* الكتلة الوسطى: صفّان متجاوران — النصّ يميناً (محاذاة يمينية)، الشارة يساراً متمركزةً رأسياً. */
.midrow{display:flex;flex-direction:row;align-items:center;justify-content:center;gap:30px;width:100%;margin:8px 0;}
.midtext{display:flex;flex-direction:column;align-items:flex-start;text-align:start;gap:12px;max-width:300px;}
.midbadge{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:9px;}
.signblock{display:flex;flex-direction:column;align-items:center;gap:2px;}
.signblock .role{font-size:12.5px;font-weight:700;color:var(--text);white-space:nowrap;}
.signblock .pname{font-size:11.5px;color:var(--muted);white-space:nowrap;}
.ach{font-size:13.5px;line-height:1.65;color:var(--text);}
.dua{font-size:13px;line-height:1.6;color:var(--muted);}

.hex{width:78px;height:78px;background:var(--gold);
  clip-path:polygon(50% 0,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  color:#463D34;box-shadow:0 2px 5px rgba(70,61,52,.28);}
.hex .k{font-size:9.5px;font-weight:600;opacity:.85;}
.hex .v{font-size:15.5px;font-weight:700;line-height:1.1;}

.qrrow{display:flex;flex-direction:row-reverse;align-items:center;justify-content:center;gap:12px;margin:4px 0 1px;}
.qr{width:76px;height:76px;border:1px solid var(--line);border-radius:6px;padding:4px;background:#fff;}
.qrmeta{text-align:start;max-width:230px;}
.qrmeta .t{font-size:12px;color:var(--muted);line-height:1.5;}
.qrmeta .no{font-size:13px;font-weight:700;color:var(--text);margin-top:3px;}
.qrmeta .no b{font-family:'IBM Plex Sans Arabic';letter-spacing:1px;}
.issued{font-size:13px;color:var(--muted);margin-top:2px;}
</style></head>
<body>
<div class="page">
  <div class="mat"></div>
  <div class="f1"></div>
  <div class="f2"></div>
  ${corner("tl")}${corner("tr")}${corner("br")}${corner("bl")}

  <div class="content">
    <!-- الصدر -->
    <div class="sec">
      <div class="basmala">بسم الله الرحمن الرحيم</div>
      ${logo ? `<img class="logo" src="${logo}" alt="" />` : ""}
      <div class="banner"><span>شهادة</span></div>
      <div class="headline gold">${esc(headline)}</div>
      <div class="uline"></div>
    </div>

    <!-- المتن -->
    <div class="sec">
      <div class="attest">تشهد ${esc(brand)} بأنّ الطالب</div>
      <div class="name">${esc(data.recipientName)}</div>
      <div class="midrow">
        <div class="midtext">
          <div class="ach">${esc(ach1)}<br/>${esc(ach2)}</div>
          <div class="dua">${esc(DUA[0])}<br/>${esc(DUA[1])}</div>
        </div>
        <div class="midbadge">
          <div class="hex"><span class="k">مرتبة</span><span class="v">${esc(rank)}</span></div>
          <div class="signblock">
            <div class="role">المشرف العام على الحلقات</div>
            <div class="pname">د. أحمد بن إبراهيم الشبيلي</div>
          </div>
        </div>
      </div>
    </div>

    <!-- الذيل -->
    <div class="sec">
      <div class="qrrow">
        <img class="qr" src="${qrDataUrl}" width="82" height="82" alt="QR" />
        <div class="qrmeta">
          <div class="t">امسح الرمز للتحقّق من صحّة الشهادة</div>
          <div class="no">رقم التوثيق: <b dir="ltr">${esc(docNo)}</b></div>
        </div>
      </div>
      <div class="issued">صدرت في ${esc(issued)}</div>
    </div>
  </div>
</div>
</body></html>`;
}

/** يبني HTML الشهادة كاملاً (QR + خطوط + شعار مُضمَّنة) — يُشارَك بين الرسم والمعاينة. */
export async function buildCertificateHtml(data: CertificateData, options: RenderOptions = {}): Promise<string> {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const fontsDir = options.fontsDir ?? path.join(process.cwd(), "public", "fonts");
  const qrDataUrl = await QRCode.toDataURL(data.verifyUrl, { margin: 1, width: 240, color: { dark: "#463D34", light: "#FFFFFF" } });
  return buildHtml(data, qrDataUrl, fontsDir, width, height);
}

async function launchBrowser(width: number, height: number): Promise<Browser> {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
      defaultViewport: { width, height, deviceScaleFactor: 2 },
    });
  }
  return puppeteer.launch({
    executablePath: LOCAL_CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width, height, deviceScaleFactor: 2 },
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
    // معامل مقياسٍ ٢ لحدّةٍ أعلى — الناتج ضعف الأبعاد المنطقيّة بنفس النسبة.
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
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

/**
 * يضمن وجود صورة الشهادة: إن كانت مخزَّنة أعادها؛ وإلا رسمها (كسولٌ عند أول طلب —
 * Chromium ثقيل) ورفعها إلى التخزين وحفظ رابطها. الاعتماد الثقيل على هذا المسار وحده.
 */
export async function ensureCertificateImage(certId: string, db: PrismaClient = prisma): Promise<string> {
  const c = await db.certificate.findUniqueOrThrow({
    where: { id: certId },
    select: { imageUrl: true, verifyToken: true, template: true, isExcellent: true, issuedAt: true, student: { select: { user: { select: { nameAsInId: true } } } } },
  });
  if (c.imageUrl) return c.imageUrl;

  const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? "https://albrrak.vercel.app").replace(/\/$/, "");
  const png = await renderCertificatePng({
    recipientName: c.student.user.nameAsInId,
    template: c.template as CertTemplate,
    isExcellent: c.isExcellent,
    token: c.verifyToken,
    verifyUrl: `${appBase}/verify/${c.verifyToken}`,
    issuedAtIso: c.issuedAt.toISOString().slice(0, 10),
    brand: "حلقات الشيخ محمد البراك",
  });
  const url = await uploadCertificatePng(png);
  await db.certificate.update({ where: { id: certId }, data: { imageUrl: url } });
  return url;
}
