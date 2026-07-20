"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

/**
 * M35 — client chart island for the dashboard. Server components fetch and shape
 * the data; this renders the interactive donut. Kept generic (name/value pairs)
 * so both the allocation-by-kind and the liquids-breakdown pies reuse it.
 */

const PALETTE = ["#2563eb", "#0d9488", "#d97706", "#7c3aed", "#dc2626", "#0891b2", "#65a30d", "#db2777"];

export function DonutChart({
  data,
  locale,
  currency,
}: {
  data: { name: string; value: number }[];
  locale: string;
  currency: string;
}) {
  const positive = data.filter((d) => d.value > 0);
  const total = positive.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;
  const fmt = new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={positive} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {positive.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number, name: string) => [`${fmt.format(v)} · ${Math.round((v / total) * 100)}%`, name]} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
