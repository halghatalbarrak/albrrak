import type { ButtonHTMLAttributes } from "react";

import { ui, sp } from "./tokens";

type Variant = "primary" | "bronze" | "ghost" | "danger";
type Size = "md" | "sm";

const bg: Record<Variant, string> = {
  primary: ui.color.primary, bronze: ui.color.bronze, ghost: "transparent", danger: ui.color.danger,
};
const fg: Record<Variant, string> = {
  primary: "#fff", bronze: "#fff", ghost: ui.color.primary, danger: "#fff",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** زرّ الهوية (المرحلة ١) — أربع صيغ. عرضٌ فقط، بلا منطق. */
export function Button({ variant = "primary", size = "md", style, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      style={{
        fontFamily: ui.font,
        fontWeight: 600,
        fontSize: size === "sm" ? ui.text.xs : ui.text.base,
        color: fg[variant],
        background: bg[variant],
        border: `1px solid ${variant === "ghost" ? ui.color.border : bg[variant]}`,
        borderRadius: ui.radius.md,
        padding: size === "sm" ? `${sp(1.5)} ${sp(2.5)}` : `${sp(2.5)} ${sp(4)}`,
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.55 : 1,
        transition: "background .15s, opacity .15s",
        ...style,
      }}
    />
  );
}
