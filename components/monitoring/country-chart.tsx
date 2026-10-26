"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function CountryChart({
  data,
}: {
  data: { name: string; count: number }[];
}) {
  if (!data.length) return null;
  return (
    <div aria-hidden="true" className="mt-5 h-72 min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart
          data={data.slice(0, 8)}
          layout="vertical"
          margin={{ top: 4, right: 24, bottom: 4, left: 0 }}
          accessibilityLayer={false}
        >
          <CartesianGrid horizontal={false} stroke="#E2E8F0" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
          <YAxis
            type="category"
            dataKey="name"
            width={105}
            tick={{ fontSize: 12 }}
            tickFormatter={(value: string) =>
              value.length > 16 ? `${value.slice(0, 15)}…` : value
            }
          />
          <Tooltip formatter={(value) => [value, "Alumni"]} />
          <Bar dataKey="count" fill="#087E8B" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
