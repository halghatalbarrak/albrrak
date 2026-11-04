"use client";

import { useState, type InputHTMLAttributes } from "react";

import { inputStyle } from "./Field";
import { ui, sp } from "./tokens";

// عرض زرّ الأيقونة، ويُترك بقدره فراغٌ في جهة البداية حتى لا يركب النصّ على الأيقونة.
const BTN = sp(9); // 36px

/** أيقونة عينٍ مضمّنة (SVG — بلا تبعية خارجية): مفتوحة حين الكلمة مخفيّة، مشطوبة حين ظاهرة. */
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {off ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** نصّ aria حين تكون الكلمة مخفيّة (إجراء الزرّ: إظهار) — من i18n في نطاق الشاشة. */
  showLabel: string;
  /** نصّ aria حين تكون الكلمة ظاهرة (إجراء الزرّ: إخفاء) — من i18n في نطاق الشاشة. */
  hideLabel: string;
};

/**
 * حقل كلمة سرٍّ بهوية المنصّة مع زرّ إظهار/إخفاء.
 * يلفّ `inputStyle` نفسه فيحافظ على تنسيق الحقل وحالات الخطأ وautoComplete، ولا يمسّ منطق الدخول.
 * زرّ الأيقونة في جهة البداية المنطقية (inline-start) فيصحّ في RTL وLTR، وtype="button" فلا يُرسل النموذج.
 */
export function PasswordInput({ showLabel, hideLabel, style, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const label = visible ? hideLabel : showLabel;
  // نُسقط اختصار padding ونضع الطولانيّات المنطقيّة؛ فنفسح للزرّ في البداية بلا تعارض اختصار/طولانيّ.
  return (
    <span style={{ position: "relative", display: "block" }}>
      <input
        {...props}
        type={visible ? "text" : "password"}
        style={{ ...inputStyle, padding: undefined, paddingBlock: sp(2.5), paddingInlineEnd: sp(3), paddingInlineStart: BTN, ...style }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        style={{
          position: "absolute", insetInlineStart: 0, top: 0, bottom: 0, width: BTN,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0, border: "none", background: "transparent", cursor: "pointer", color: ui.color.muted,
        }}
      >
        <EyeIcon off={visible} />
      </button>
    </span>
  );
}
