"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import type { CategoryStat, UtilizationPoint } from "@/lib/dashboard";

const COLORS = ["#F59E0B", "#3B82F6", "#10B981", "#EF4444", "#8B5CF6", "#EC4899"];

interface DashboardChartsProps {
  categoryStats: CategoryStat[];
  utilizationHistory: UtilizationPoint[];
}

export function DashboardCharts({ categoryStats, utilizationHistory }: DashboardChartsProps) {
  const total = categoryStats.reduce((s, c) => s + c.count, 0);
  const pieData = categoryStats.map((c) => ({
    name: c.name,
    value: total > 0 ? Math.round((c.count / total) * 100) : 0,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="xl:col-span-2 border border-border rounded-xl bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Taxa de Utilização de Equipamentos</h2>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={utilizationHistory}>
            <defs>
              <linearGradient id="utilGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1a1d24", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#94a3b8" }}
              itemStyle={{ color: "#F59E0B" }}
              formatter={(v) => [`${v}%`, "Utilização"]}
            />
            <Area type="monotone" dataKey="utilization" stroke="#F59E0B" strokeWidth={2} fill="url(#utilGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="border border-border rounded-xl bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Por Categoria</h2>
        {pieData.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum equipamento cadastrado.</p>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <PieChart width={100} height={100}>
              <Pie data={pieData} cx={45} cy={45} innerRadius={28} outerRadius={45} paddingAngle={3} dataKey="value">
                {pieData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
            <ul className="space-y-2 flex-1">
              {pieData.map((entry, index) => (
                <li key={entry.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index] }} />
                    <span className="text-muted-foreground">{entry.name}</span>
                  </span>
                  <span className="font-semibold text-foreground">{entry.value}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
