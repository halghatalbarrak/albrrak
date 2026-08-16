import { Badge, Button, Card, Header, PageShell, Table, ui, sp, type Column } from "@/components/ui";

// معاينة الهوية (المرحلة ١) — لعرض الرموز والمكوّنات بصريًّا. لا تمسّ أيّ شاشةٍ أو منطق.

interface Row { name: string; hizb: number; rank: "تميّز" | "اجتياز" | "رسوب" }
const rows: Row[] = [
  { name: "عبدالله القحطاني", hizb: 60, rank: "تميّز" },
  { name: "محمد الغامدي", hizb: 59, rank: "اجتياز" },
  { name: "سالم العتيبي", hizb: 58, rank: "رسوب" },
];
const cols: Column<Row>[] = [
  { key: "name", header: "الطالب", cell: (r) => r.name },
  { key: "hizb", header: "الحزب", cell: (r) => r.hizb },
  { key: "rank", header: "المرتبة", cell: (r) => (
    <Badge tone={r.rank === "تميّز" ? "success" : r.rank === "اجتياز" ? "bronze" : "danger"}>{r.rank}</Badge>
  ) },
];

const swatches = [
  ["أساسيّ", ui.color.primary], ["برونزيّ", ui.color.bronze],
  ["خلفية", ui.color.bg], ["بطاقة", ui.color.surface],
];

export default function UiPreview() {
  return (
    <PageShell roles={["CIRCLE_MANAGER"]} userName="مدير الحلقات" activeHref="/admin/approvals">
      <div style={{ display: "flex", flexDirection: "column", gap: sp(6) }}>
        <h1 style={{ fontSize: ui.text.xxxl, fontWeight: 700, margin: 0 }}>هوية منصّة حلقات الشيخ محمد البراك</h1>
        <p style={{ fontSize: ui.text.base, color: ui.color.muted, margin: 0 }}>معاينة المرحلة ١ — الرموز والمكوّنات المشتركة (IBM Plex Sans Arabic).</p>

        <Card>
          <h2 style={{ fontSize: ui.text.xl, fontWeight: 600, marginTop: 0 }}>الألوان</h2>
          <div style={{ display: "flex", gap: sp(3), flexWrap: "wrap" }}>
            {swatches.map(([label, c]) => (
              <div key={c} style={{ textAlign: "center" }}>
                <div style={{ width: 80, height: 56, borderRadius: ui.radius.md, background: c, border: `1px solid ${ui.color.border}` }} />
                <div style={{ fontSize: ui.text.xs, marginTop: sp(1) }}>{label}</div>
                <div style={{ fontSize: 11, color: ui.color.muted, direction: "ltr" }}>{c}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 style={{ fontSize: ui.text.xl, fontWeight: 600, marginTop: 0 }}>سلّم الخطّ</h2>
          <div style={{ fontSize: ui.text.xxxl, fontWeight: 700 }}>عنوانٌ كبير ٤٠</div>
          <div style={{ fontSize: ui.text.xxl, fontWeight: 600 }}>عنوانٌ ٣٢</div>
          <div style={{ fontSize: ui.text.xl, fontWeight: 600 }}>عنوانٌ ٢٤</div>
          <div style={{ fontSize: ui.text.base }}>نصٌّ عاديّ ١٦ — منصّة حلقات البراك لإدارة حلقات التحفيظ.</div>
          <div style={{ fontSize: ui.text.xs, color: ui.color.muted }}>نصٌّ صغير ١٤ / خافت.</div>
        </Card>

        <Card>
          <h2 style={{ fontSize: ui.text.xl, fontWeight: 600, marginTop: 0 }}>الأزرار</h2>
          <div style={{ display: "flex", gap: sp(2), flexWrap: "wrap", alignItems: "center" }}>
            <Button variant="primary">أساسيّ</Button>
            <Button variant="bronze">برونزيّ</Button>
            <Button variant="ghost">شفّاف</Button>
            <Button variant="danger">خطر</Button>
            <Button variant="primary" size="sm">صغير</Button>
            <Button variant="primary" disabled>معطّل</Button>
          </div>
          <div style={{ marginTop: sp(3), display: "flex", gap: sp(2), flexWrap: "wrap" }}>
            <Badge tone="success">تميّز</Badge>
            <Badge tone="bronze">اجتياز</Badge>
            <Badge tone="danger">رسوب</Badge>
            <Badge tone="primary">وسم</Badge>
            <Badge tone="neutral">محايد</Badge>
          </div>
        </Card>

        <Card>
          <h2 style={{ fontSize: ui.text.xl, fontWeight: 600, marginTop: 0 }}>الجدول</h2>
          <Table columns={cols} rows={rows} />
        </Card>

        <Card>
          <h2 style={{ fontSize: ui.text.xl, fontWeight: 600, marginTop: 0 }}>القائمة حسب الدور</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: sp(3) }}>
            <div><div style={{ fontSize: ui.text.xs, color: ui.color.muted, marginBottom: sp(1) }}>المعلّم:</div><Header roles={["TEACHER"]} /></div>
            <div><div style={{ fontSize: ui.text.xs, color: ui.color.muted, marginBottom: sp(1) }}>الطالب/الوليّ:</div><Header roles={["STUDENT"]} /></div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
