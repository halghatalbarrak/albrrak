import type { HTMLAttributes } from "react";

import { ui, sp } from "./tokens";

/** حاوية المحتوى — عرضٌ أقصى ومحاذاةٌ وسطيّة (المرحلة ١). */
export function Container({ style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      style={{
        width: "100%",
        maxWidth: 1080,
        margin: "0 auto",
        padding: `0 ${sp(4)}`,
        fontFamily: ui.font,
        color: ui.color.text,
        ...style,
      }}
    />
  );
}
