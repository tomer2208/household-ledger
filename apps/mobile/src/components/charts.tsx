// The four report charts (US-A1 AC2), drawn with plain SVG from report metrics.
// No chart library: four simple shapes don't justify Skia, and SVG renders identically
// on iOS and in the web preview.

import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import type { ReportMetrics } from '@/api/types';
import { formatMoney } from '@/lib/money';
import { useColors } from '@/lib/theme';

// SVG text doesn't inherit the app font on web; iOS already uses the system font.
const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, sans-serif' : undefined;

// Ordered, colorblind-safe categorical palette; "Other" slices share the last swatch.
const PALETTE = ['#4E79A7', '#F28E2B', '#59A14F', '#E15759', '#B07AA1', '#76B7B2', '#EDC948', '#9C755F'];
const monthShort = (ym: string) =>
  new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString('en-US', { month: 'short' });

function useChartWidth() {
  const { width } = useWindowDimensions();
  return Math.min(width, 560) - 64;
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={[s.card, { backgroundColor: c.cell }]}>
      <Text style={[s.title, { color: c.label }]}>{title}</Text>
      {children}
    </View>
  );
}

// 1. Where the money went: donut of category share.
export function CategoryDonut({ m }: { m: ReportMetrics }) {
  const c = useColors();
  const cats = m.categories.filter((x) => x.spent > 0);
  const top = cats.slice(0, 7);
  const rest = cats.slice(7).reduce((a, x) => a + x.spent, 0);
  const slices = [...top.map((x) => ({ name: x.name, v: x.spent })), ...(rest > 0 ? [{ name: 'Other', v: rest }] : [])];
  const total = slices.reduce((a, x) => a + x.v, 0);
  if (total <= 0) return null;
  const R = 70;
  const r = 44;
  let angle = -Math.PI / 2;
  const arcs = slices.map((sl, i) => {
    const sweep = (sl.v / total) * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    const large = sweep > Math.PI ? 1 : 0;
    const p = (rad: number, rr: number) => `${80 + rr * Math.cos(rad)} ${80 + rr * Math.sin(rad)}`;
    // a full circle can't be drawn as one arc; split it
    const d =
      sweep >= Math.PI * 2 - 1e-6
        ? `M ${p(0, R)} A ${R} ${R} 0 1 1 ${p(Math.PI, R)} A ${R} ${R} 0 1 1 ${p(0, R)} M ${p(0, r)} A ${r} ${r} 0 1 0 ${p(Math.PI, r)} A ${r} ${r} 0 1 0 ${p(0, r)}`
        : `M ${p(a0, R)} A ${R} ${R} 0 ${large} 1 ${p(a1, R)} L ${p(a1, r)} A ${r} ${r} 0 ${large} 0 ${p(a0, r)} Z`;
    return { d, color: PALETTE[Math.min(i, PALETTE.length - 1)], ...sl };
  });
  return (
    <ChartCard title="Where it went">
      <View style={s.donutRow}>
        <Svg width={160} height={160}>
          {arcs.map((a) => (
            <Path key={a.name} d={a.d} fill={a.color} stroke={c.cell as string} strokeWidth={1.5} />
          ))}
          <SvgText fontFamily={FONT} x={80} y={78} textAnchor="middle" fontSize={13} fill={c.secondaryLabel as string}>
            Total
          </SvgText>
          <SvgText fontFamily={FONT} x={80} y={96} textAnchor="middle" fontSize={15} fontWeight="700" fill={c.label as string}>
            {formatMoney(total, m.currency)}
          </SvgText>
        </Svg>
        <View style={s.legend}>
          {arcs.map((a) => (
            <View key={a.name} style={s.legendRow}>
              <View style={[s.swatch, { backgroundColor: a.color }]} />
              <Text numberOfLines={1} style={[s.legendText, { color: c.label }]}>
                {a.name}
              </Text>
              <Text style={[s.legendPct, { color: c.secondaryLabel }]}>{Math.round((a.v * 100) / total)}%</Text>
            </View>
          ))}
        </View>
      </View>
    </ChartCard>
  );
}

// 2. Budget vs actual per category (only categories with a cap).
export function CapBars({ m }: { m: ReportMetrics }) {
  const c = useColors();
  const w = useChartWidth();
  const rows = m.categories.filter((x) => x.cap > 0).slice(0, 8);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((x) => Math.max(x.cap, x.spent)));
  const labelW = 92;
  const barW = w - labelW - 8;
  const rowH = 30;
  return (
    <ChartCard title="Budget vs. spent">
      <Svg width={w} height={rows.length * rowH}>
        {rows.map((x, i) => {
          const y = i * rowH;
          const over = x.spent > x.cap;
          return (
            <G key={x.key}>
              <SvgText fontFamily={FONT} x={0} y={y + 18} fontSize={13} fill={c.label as string}>
                {x.name.length > 12 ? `${x.name.slice(0, 11)}…` : x.name}
              </SvgText>
              <Rect x={labelW} y={y + 6} width={(x.cap / max) * barW} height={14} rx={4} fill={c.fill as string} />
              <Rect
                x={labelW}
                y={y + 9}
                width={Math.max(2, (x.spent / max) * barW)}
                height={8}
                rx={4}
                fill={over ? (c.red as string) : (c.green as string)}
              />
              <Line x1={labelW + (x.cap / max) * barW} x2={labelW + (x.cap / max) * barW} y1={y + 3} y2={y + 23} stroke={c.secondaryLabel as string} strokeWidth={1.5} />
            </G>
          );
        })}
      </Svg>
      <Text style={[s.caption, { color: c.secondaryLabel }]}>Bar = spent · tick = budget</Text>
    </ChartCard>
  );
}

function LineChart({
  points,
  currency,
  color,
}: {
  points: { label: string; v: number }[];
  currency: string;
  color: string;
}) {
  const c = useColors();
  const w = useChartWidth();
  const h = 120;
  const pad = { l: 8, r: 8, t: 16, b: 22 };
  const max = Math.max(1, ...points.map((p) => p.v));
  const min = Math.min(0, ...points.map((p) => p.v));
  const x = (i: number) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, points.length - 1);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min || 1)) * (h - pad.t - pad.b);
  const last = points[points.length - 1];
  return (
    <Svg width={w} height={h}>
      <Line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} stroke={c.separator as string} strokeWidth={1} />
      <Polyline points={points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')} fill="none" stroke={color} strokeWidth={2.5} />
      {points.map((p, i) => (
        <G key={p.label}>
          <Circle cx={x(i)} cy={y(p.v)} r={i === points.length - 1 ? 4.5 : 3} fill={color} />
          <SvgText fontFamily={FONT} x={x(i)} y={h - 6} fontSize={11} textAnchor="middle" fill={c.secondaryLabel as string}>
            {p.label}
          </SvgText>
        </G>
      ))}
      {last ? (
        <SvgText fontFamily={FONT} x={x(points.length - 1)} y={y(last.v) - 8} fontSize={11} textAnchor="end" fill={c.label as string}>
          {formatMoney(last.v, currency)}
        </SvgText>
      ) : null}
    </Svg>
  );
}

// 3. Six-month spending trend.
export function TrendLine({ m }: { m: ReportMetrics }) {
  const c = useColors();
  return (
    <ChartCard title="Six-month spending">
      <LineChart points={m.trend.map((p) => ({ label: monthShort(p.month), v: p.spent }))} currency={m.currency} color={c.tint as string} />
    </ChartCard>
  );
}

// 4. Savings balance over time.
export function SavingsLine({ m }: { m: ReportMetrics }) {
  const c = useColors();
  return (
    <ChartCard title="Savings balance">
      <LineChart points={m.savings_trend.map((p) => ({ label: monthShort(p.month), v: p.balance }))} currency={m.currency} color={c.green as string} />
    </ChartCard>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 16, borderRadius: 14, padding: 16, gap: 10 },
  title: { fontSize: 17, fontWeight: '600' },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legend: { flex: 1, gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { flex: 1, fontSize: 13 },
  legendPct: { fontSize: 13, fontVariant: ['tabular-nums'] },
  caption: { fontSize: 12 },
});
