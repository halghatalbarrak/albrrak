import type { InputHTMLAttributes } from "react";

import { inputStyle } from "./Field";

/** مدخلٌ نصّيٌّ بهوية المنصّة — يلفّ inputStyle كي تتوحّد الحقول. */
export function Input({ style, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...style }} />;
}
