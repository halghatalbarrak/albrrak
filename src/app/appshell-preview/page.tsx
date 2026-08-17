"use client";

// معاينةٌ QA للمرحلة ٤ — لا منطق ولا بيانات حقيقيّة. لعرض الهيكل والمكوّنات فقط.

import { useState } from "react";

import { AppShell, Stat, EmptyState, Field, Input, Select, Skeleton, Modal, Button, Card, ui, sp } from "@/components/ui";

const ROLES: Record<string, string[]> = {
  "المدير": ["CIRCLE_MANAGER"],
  "المعلّم": ["TEACHER"],
  "المُسمِّع": ["RECITER"],
  "الطالب": [],
};

export default function AppShellPreview() {
  const [role, setRole] = useState<keyof typeof ROLES>("المدير");
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
            <div style={{ fontSize: ui.text.xs, fontWeight: 600, color: ui.color.muted, marginBottom: 2 }}>الخطوة التالية</div>
            <div style={{ fontSize: ui.text.lg, fontWeight: 700, color: ui.color.text }}>لديك ٥ طلبَ قيدٍ بانتظار المراجعة</div>
          </div>
          <Button variant="primary">راجِع الطلبات</Button>
        </Card>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: sp(4), marginBottom: sp(8) }}>
          <Stat label="الطلاب" value="١٤٢" hint="في مسار التعلّم" />
          <Stat label="الحلقات" value="٨" tone="bronze" />
          <Stat label="طلبات معلّقة" value="٥" tone="danger" hint="بانتظار القبول" />
          <Stat label="اعتمادات معلّقة" value="٣" tone="danger" hint="انتقال/تخرّج" />
          <Stat label="حضور اليوم" value="٦/٨" tone="primary" hint="حلقاتٌ رُصدت" />
        </section>

        <Card style={{ marginBottom: sp(6) }}>
          <h2 style={{ marginTop: 0, fontSize: ui.text.lg, fontWeight: 700 }}>نموذجٌ بمكوّنات موحّدة</h2>
          <Field label="اسم الطالب"><Input placeholder="اكتب الاسم…" /></Field>
          <Field label="الحلقة">
            <Select defaultValue="">
              <option value="" disabled>اختر…</option>
              <option>حلقة الفجر</option>
              <option>حلقة العصر</option>
            </Select>
          </Field>
          <Button onClick={() => setModal(true)}>فتح نافذةٍ منبثقة</Button>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sp(6) }}>
          <Card>
            <h3 style={{ marginTop: 0, fontSize: ui.text.base, fontWeight: 700 }}>حالةُ فراغ</h3>
            <EmptyState title="لا طلبات معلّقة" description="ستظهر هنا طلبات القيد الجديدة عند ورودها." action={<Button variant="ghost" size="sm">تحديث</Button>} />
          </Card>
          <Card>
            <h3 style={{ marginTop: 0, fontSize: ui.text.base, fontWeight: 700 }}>تحميل (Skeleton)</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}>
              <Skeleton height={20} width="60%" />
              <Skeleton height={16} />
              <Skeleton height={16} width="85%" />
              <Skeleton height={16} width="70%" />
            </div>
          </Card>
        </div>

        <Modal open={modal} onClose={() => setModal(false)} title="تأكيد الإجراء" footer={<><Button variant="danger" size="sm" onClick={() => setModal(false)}>حذف</Button><Button variant="ghost" size="sm" onClick={() => setModal(false)}>إلغاء</Button></>}>
          <p style={{ margin: 0, color: ui.color.text }}>هذا مثالٌ لنافذةٍ منبثقةٍ بهوية المنصّة — تُغلق بـ Esc أو بالنقر خارجها.</p>
        </Modal>
      </AppShell>
    </div>
  );
}
