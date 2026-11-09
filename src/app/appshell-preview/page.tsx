"use client";

// معاينةٌ QA للمرحلة ٤ — لا منطق ولا بيانات حقيقيّة. لعرض الهيكل والمكوّنات فقط.

import { useState } from "react";

import { AppShell, Stat, EmptyState, Field, Input, Select, Skeleton, Modal, Button, Card, ui, sp } from "@/components/ui";
import { tAppshellPreview as tp } from "@/i18n/ar/appshell-preview";

const ROLES: Record<string, string[]> = {
  "المدير": ["CIRCLE_MANAGER"],
  "المعلّم": ["TEACHER"],
  "المُسمِّع": ["RECITER"],
  "الطالب": [],
};

export default function AppShellPreview() {
  const [role, setRole] = useState<keyof typeof ROLES>(Object.keys(ROLES)[0] as keyof typeof ROLES);
  const [modal, setModal] = useState(false);

  return (
    <div>
      <div style={{ position: "fixed", bottom: 12, left: 12, zIndex: 200, display: "flex", gap: 6, background: "#fff", padding: 8, borderRadius: 8, boxShadow: ui.shadowCard }}>
        {Object.keys(ROLES).map((r) => (
          <Button key={r} size="sm" variant={r === role ? "bronze" : "ghost"} onClick={() => setRole(r as keyof typeof ROLES)}>{r}</Button>
        ))}
      </div>

      <AppShell
        roles={ROLES[role]}
        userName="محمد البراك"
        activeHref="/admin/students"
        title="لوحة التحكّم — معاينة الهيكل"
        crumbs={[{ label: "الرئيسة", href: "/" }, { label: "الإدارة" }, { label: "الطلاب" }]}
      >
        {/* محاكاةُ الصفحة الرئيسة (المرحلة ٥): الخطوة التالية + بطاقات الملخّص */}
        <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp(4), flexWrap: "wrap", borderInlineStart: `4px solid ${ui.color.primary}`, marginBottom: sp(6) }}>
          <div>
            <div style={{ fontSize: ui.text.xs, fontWeight: 600, color: ui.color.muted, marginBottom: 2 }}>{tp("nextStep")}</div>
            <div style={{ fontSize: ui.text.lg, fontWeight: 700, color: ui.color.text }}>{tp("pendingApps5")}</div>
          </div>
          <Button variant="primary">{tp("reviewApps")}</Button>
        </Card>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: sp(4), marginBottom: sp(8) }}>
          <Stat label="الطلاب" value="١٤٢" hint="في مسار التعلّم" />
          <Stat label="الحلقات" value="٨" tone="bronze" />
          <Stat label="طلبات معلّقة" value="٥" tone="danger" hint="بانتظار القبول" />
          <Stat label="اعتمادات معلّقة" value="٣" tone="danger" hint="انتقال/تخرّج" />
          <Stat label="حضور اليوم" value="٦/٨" tone="primary" hint="حلقاتٌ رُصدت" />
        </section>

        <Card style={{ marginBottom: sp(6) }}>
          <h2 style={{ marginTop: 0, fontSize: ui.text.lg, fontWeight: 700 }}>{tp("unifiedComponentsForm")}</h2>
          <Field label="اسم الطالب"><Input placeholder="اكتب الاسم…" /></Field>
          <Field label="الحلقة">
            <Select defaultValue="">
              <option value="" disabled>{tp("choose")}</option>
              <option>{tp("fajrCircle")}</option>
              <option>{tp("asrCircle")}</option>
            </Select>
          </Field>
          <Button onClick={() => setModal(true)}>{tp("openModal")}</Button>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp(6) }}>
          <Card>
            <h3 style={{ marginTop: 0, fontSize: ui.text.base, fontWeight: 700 }}>{tp("emptyState")}</h3>
            <EmptyState title="لا طلبات معلّقة" description="ستظهر هنا طلبات القيد الجديدة عند ورودها." action={<Button variant="ghost" size="sm">{tp("refresh")}</Button>} />
          </Card>
          <Card>
            <h3 style={{ marginTop: 0, fontSize: ui.text.base, fontWeight: 700 }}>{tp("loadingSkeleton")}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}>
              <Skeleton height={20} width="60%" />
              <Skeleton height={16} />
              <Skeleton height={16} width="85%" />
              <Skeleton height={16} width="70%" />
            </div>
          </Card>
        </div>

        <Modal open={modal} onClose={() => setModal(false)} title="تأكيد الإجراء" footer={<><Button variant="danger" size="sm" onClick={() => setModal(false)}>{tp("delete")}</Button><Button variant="ghost" size="sm" onClick={() => setModal(false)}>{tp("cancel")}</Button></>}>
          <p style={{ margin: 0, color: ui.color.text }}>{tp("modalExample")}</p>
        </Modal>
      </AppShell>
    </div>
  );
}
