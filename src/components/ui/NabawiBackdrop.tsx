/**
 * طبقةٌ زخرفيّةٌ نبويّة (مشترَكة): نجمةٌ ثمانيّةٌ هندسيّة SVG خالصة مستوحاةٌ من سقف المسجد
 * النبويّ — شبكةٌ متكرّرةٌ بالذهبيّ (--gold-line) مع ميداليةٍ مركزيّةٍ قلبُها فيروزيّ
 * (--color-teal). شفافيّةٌ منخفضةٌ فلا تشوّش القراءة. زخرفةٌ بحتة (aria-hidden، pointerEvents:none)،
 * بلا حركة (فتحترم prefers-reduced-motion تلقائيًّا)، وتتلوّن بالوضعين الفاتح والداكن.
 *
 * تُوضَع داخل حاوٍ position:relative، خلف المحتوى (المحتوى يرفع zIndex فوقها).
 */
export function NabawiBackdrop() {
  // بلاطةٌ ٨٠×٨٠: مربّعٌ + مربّعٌ مُدارٌ ٤٥° = نجمةٌ ثمانيّة، تتكرّر عبر الخلفيّة كلّها.
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0, color: "var(--gold-line)" }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.1 }} preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="nabawiStar" width="80" height="80" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="20" y="20" width="40" height="40" />
              <polygon points="40,10 70,40 40,70 10,40" />
              <circle cx="40" cy="40" r="6" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#nabawiStar)" />
      </svg>

      {/* ميداليةٌ مركزيّة: نجمةٌ ثمانيّةٌ أكبر (توسيعٌ لفكرة icon.svg) بقلبٍ فيروزيّ خفيف. */}
      <svg viewBox="0 0 240 240" width="min(80vw, 520px)" height="min(80vw, 520px)"
        style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: 0.12 }}>
        <g fill="none" stroke="var(--gold-line)" strokeWidth="1.4">
          <circle cx="120" cy="120" r="110" />
          <rect x="45" y="45" width="150" height="150" />
          <rect x="45" y="45" width="150" height="150" transform="rotate(45 120 120)" />
          <rect x="70" y="70" width="100" height="100" />
          <rect x="70" y="70" width="100" height="100" transform="rotate(45 120 120)" />
          <circle cx="120" cy="120" r="34" />
        </g>
        {/* القلب الفيروزيّ الخفيف */}
        <circle cx="120" cy="120" r="34" fill="var(--color-teal)" opacity="0.14" />
        <circle cx="120" cy="120" r="12" fill="var(--color-teal)" opacity="0.22" />
      </svg>
    </div>
  );
}
