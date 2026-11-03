'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCompact, formatNumber } from '@/lib/format';
import { EmptyState } from './feedback';
import { BarChart3 } from 'lucide-react';

export interface SeriesDef {
  key: string;
  label: string;
  /** token index 1–6 */
  color?: 1 | 2 | 3 | 4 | 5 | 6;
}

const color = (i: number) => `var(--chart-${i})`;

const axis = { stroke: 'var(--muted-foreground)', fontSize: 11, tickLine: false, axisLine: false } as const;

function ChartTooltip() {
  return (
    <Tooltip
      cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
      contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, boxShadow: 'var(--shadow-md)', color: 'var(--popover-foreground)' }}
      labelStyle={{ color: 'var(--muted-foreground)', marginBottom: 4 }}
      formatter={(v) => formatNumber(v as number)}
    />
  );
}

function hasData(data: Record<string, unknown>[], series: SeriesDef[]) {
  return data.some((d) => series.some((s) => Number(d[s.key] ?? 0) !== 0));
}

interface ChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  series: SeriesDef[];
  height?: number;
  xFormatter?: (v: string) => string;
  emptyTitle?: string;
}

function Empty({ height, title }: { height: number; title?: string }) {
  return (
    <div style={{ height }} className="flex items-center justify-center">
      <EmptyState compact icon={BarChart3} title={title ?? 'No activity in this period'} />
    </div>
  );
}

export function BarChartCard({ data, xKey, series, height = 240, xFormatter, stacked, emptyTitle }: ChartProps & { stacked?: boolean }) {
  if (!hasData(data, series)) return <Empty height={height} title={emptyTitle} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="25%">
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} {...axis} tickFormatter={xFormatter} minTickGap={12} />
        <YAxis {...axis} tickFormatter={(v) => formatCompact(v)} width={48} allowDecimals={false} />
        <ChartTooltip />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={color(s.color ?? i + 1)} radius={stacked ? 0 : [3, 3, 0, 0]} stackId={stacked ? 'a' : undefined} maxBarSize={28} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AreaChartCard({ data, xKey, series, height = 240, xFormatter, emptyTitle }: ChartProps) {
  if (!hasData(data, series)) return <Empty height={height} title={emptyTitle} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} {...axis} tickFormatter={xFormatter} minTickGap={16} />
        <YAxis {...axis} tickFormatter={(v) => formatCompact(v)} width={48} />
        <ChartTooltip />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={color(s.color ?? i + 1)} fill={color(s.color ?? i + 1)} fillOpacity={0.12} strokeWidth={1.75} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function LineChartCard({ data, xKey, series, height = 240, xFormatter, emptyTitle }: ChartProps) {
  if (!hasData(data, series)) return <Empty height={height} title={emptyTitle} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} {...axis} tickFormatter={xFormatter} minTickGap={16} />
        <YAxis {...axis} tickFormatter={(v) => formatCompact(v)} width={48} />
        <ChartTooltip />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={color(s.color ?? i + 1)} strokeWidth={1.75} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
