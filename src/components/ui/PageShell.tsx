import type { ReactNode } from "react";

import { ui, sp } from "./tokens";
import { Header, type HeaderProps } from "./Header";
import { Container } from "./Container";

/** هيكل الصفحة (المرحلة ١): ترويسة (شعار + قائمة الدور) + خلفيّة الهوية + حاوية المحتوى. */
export function PageShell({ roles, userName, activeHref, children }: HeaderProps & { children: ReactNode }) {
  return (
    <div dir="rtl" style={{ background: ui.color.bg, minHeight: "100dvh", fontFamily: ui.font, color: ui.color.text }}>
      <Header roles={roles} userName={userName} activeHref={activeHref} />
      <main>
        <Container style={{ paddingTop: sp(6), paddingBottom: sp(10) }}>{children}</Container>
      </main>
    </div>
  );
}
