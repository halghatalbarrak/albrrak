"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ui } from "@/components/ui/tokens";

interface AnalyticsBarProps {
  data: Record<string, string | number>[];
  bars: { key: string; label: string; color: string }[];
  height?: number;
}

/** رسم بيانيّ شريطيّ — يُحمَّل ديناميكيًّا لتجنّب خطأ SSR. */
export function AnalyticsBar({ data, bars, height = 180 }: AnalyticsBarProps) {
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={ui.color.border} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: ui.color.muted }} />
        <YAxis tick={{ fontSize: 10, fill: ui.color.muted }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ fontSize: 11, background: ui.color.surface, border: `1px solid ${ui.color.border}` }}
          labelStyle={{ fontWeight: 600 }}
        />
        {bars.length > 1 && <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />}
        {bars.map((b) => (
          <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} radius={[3, 3, 0, 0]} maxBarSize={40} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
