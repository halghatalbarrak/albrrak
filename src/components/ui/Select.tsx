import type { SelectHTMLAttributes } from "react";

import { inputStyle } from "./Field";

/** قائمةُ اختيارٍ بهوية المنصّة — نفس إطار المدخل، مع سهمٍ أصيلٍ للمتصفّح. */
export function Select({ style, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...inputStyle, cursor: "pointer", ...style }}>{children}</select>;
}
