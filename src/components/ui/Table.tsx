import type { ReactNode } from "react";

import { ui, sp } from "./tokens";

export interface Column<T> { key: string; header: string; cell: (row: T) => ReactNode }

/** جدولٌ بهوية المنصّة (المرحلة ١) — عرضٌ فقط. */
export function Table<T>({ columns, rows, empty = "لا بيانات." }: { columns: Column<T>[]; rows: T[]; empty?: string }) {
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.lg, background: ui.color.surface }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: ui.font, fontSize: ui.text.base, color: ui.color.text }}>
        <thead>
          <tr style={{ background: "#efe9e2" }}>
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: "start", fontWeight: 600, color: ui.color.primary, padding: `${sp(2.5)} ${sp(3)}` }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ padding: sp(4), color: ui.color.muted, textAlign: "center" }}>{empty}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${ui.color.border}` }}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: `${sp(2.5)} ${sp(3)}` }}>{c.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
