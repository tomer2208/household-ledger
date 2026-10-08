// The four report charts (US-A1 AC2), drawn with plain SVG from report metrics.
// P1-11: a slice, a bar or a month opens what it stands for. The touch targets are invisible
// Pressables laid over the drawing, so each has a label for VoiceOver and works the same on web.
// No chart library: four simple shapes don't justify Skia, and SVG renders identically
// on iOS and in the web preview.

import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { useCategories } from '@/api/queries';
import type { ReportMetrics } from '@/api/types';
import { lookOf } from '@/lib/category-look';
import { isRTL, locale, t } from '@/lib/i18n';
import { type TrendMonth, trendSummary } from '@/lib/budget';
import { formatMoney } from '@/lib/money';
import { dirProps } from '@/lib/rtl';
import { tokens, useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';
import { useScheme } from '@/lib/appearance';

// SVG text doesn't inherit the app font, so the labels name it (F3: Assistant).
const FONT = Platform.OS === 'web' ? `${fontFamily.body}, system-ui, sans-serif` : fontFamily.body;

// Ordered, colorblind-safe categorical palette; "Other" slices share the last swatch.
const monthShort = (ym: string) =>
  new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString(locale(), { month: 'short' });
const monthLong = (ym: string) =>
  new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });

// P1-6: SVG coordinates are physical, so each chart draws in a left-to-right box and mirrors
// itself in Hebrew: labels on the right, bars growing left, time running right to left.
function Mirror({ children }: { children: React.ReactNode }) {
  return <View {...dirProps('ltr')}>{children}</View>;
}

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
export function CategoryDonut({ m, onCategory }: { m: ReportMetrics; onCategory?: (id: string | null) => void }) {
  const c = useColors();
  // K5: each slice in its category's own colour (F2), so a chart and an envelope agree; "other" neutral.
  const dark = useScheme() === 'dark';
  const own = new Map((useCategories().data ?? []).map((x) => [x.id, x]));
  const colorOf = (id: string | null) =>
    id ? tokens.categoryColors[lookOf(own.get(id) ?? { sf_symbol: null }).color][dark ? 'dark' : 'light'].base : (c.text3 as string);
  const cats = m.categories.filter((x) => x.spent > 0);
  const top = cats.slice(0, 7);
  const rest = cats.slice(7).reduce((a, x) => a + x.spent, 0);
  // "Other" (id null) opens the whole month.
  const slices = [
    ...top.map((x) => ({ id: x.id as string | null, name: x.name, v: x.spent })),
    ...(rest > 0 ? [{ id: null, name: t.charts.other, v: rest }] : []),
  ];
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
    return { d, color: colorOf(sl.id), ...sl };
  });
  return (
    <ChartCard title={t.charts.whereItWent}>
      <View style={s.donutRow}>
        <Svg width={160} height={160}>
          {arcs.map((a) => (
            <Path key={a.name} d={a.d} fill={a.color} stroke={c.cell as string} strokeWidth={1.5} />
          ))}
          <SvgText fontFamily={FONT} x={80} y={78} textAnchor="middle" fontSize={13} fill={c.secondaryLabel as string}>
            {t.charts.total}
          </SvgText>
          <SvgText fontFamily={FONT} x={80} y={96} textAnchor="middle" fontSize={15} fontWeight="700" fill={c.label as string}>
            {formatMoney(total, m.currency)}
          </SvgText>
        </Svg>
        <View style={s.legend}>
          {arcs.map((a) => {
            const pct = Math.round((a.v * 100) / total);
            const row = (
              <>
                <View style={[s.swatch, { backgroundColor: a.color }]} />
                <Text numberOfLines={1} style={[s.legendText, { color: c.label }]}>
                  {a.name}
                </Text>
                <Text style={[s.legendPct, { color: c.secondaryLabel }]}>{pct}%</Text>
              </>
            );
            return onCategory ? (
              <Pressable
                key={a.name}
                onPress={() => onCategory(a.id)}
                accessibilityRole="button"
                accessibilityLabel={t.charts.sliceA11y(a.name, formatMoney(a.v, m.currency), pct)}
                hitSlop={{ top: 4, bottom: 4 }}
                style={({ pressed }) => [s.legendRow, pressed && { opacity: 0.6 }]}>
                {row}
              </Pressable>
            ) : (
              <View key={a.name} style={s.legendRow}>
                {row}
              </View>
            );
          })}
        </View>
      </View>
    </ChartCard>
  );
}

// 2. Budget vs actual per category (only categories with a cap).
export function CapBars({ m, onCategory }: { m: ReportMetrics; onCategory?: (id: string) => void }) {
  const c = useColors();
  const w = useChartWidth();
  const rows = m.categories.filter((x) => x.cap > 0).slice(0, 8);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((x) => Math.max(x.cap, x.spent)));
  const labelW = 92;
  const barW = w - labelW - 8;
  const rowH = 30;
  const rtl = isRTL();
  // x of a shape `width` wide that starts `from` px in from the reading edge.
  const at = (from: number, width = 0) => (rtl ? w - from - width : from);
  return (
    <ChartCard title={t.charts.budgetVsSpent}>
      <Mirror>
        <Svg width={w} height={rows.length * rowH}>
          {rows.map((x, i) => {
            const y = i * rowH;
            const over = x.spent > x.cap;
            return (
              <G key={x.key}>
                <SvgText fontFamily={FONT} x={at(0)} y={y + 18} fontSize={13} textAnchor={rtl ? 'end' : 'start'} fill={c.label as string}>
                  {x.name.length > 12 ? `${x.name.slice(0, 11)}…` : x.name}
                </SvgText>
                <Rect x={at(labelW, (x.cap / max) * barW)} y={y + 6} width={(x.cap / max) * barW} height={14} rx={4} fill={c.fill as string} />
                <Rect
                  x={at(labelW, Math.max(2, (x.spent / max) * barW))}
                  y={y + 9}
                  width={Math.max(2, (x.spent / max) * barW)}
                  height={8}
                  rx={4}
                  fill={over ? (c.red as string) : (c.green as string)}
                />
                <Line x1={at(labelW + (x.cap / max) * barW)} x2={at(labelW + (x.cap / max) * barW)} y1={y + 3} y2={y + 23} stroke={c.secondaryLabel as string} strokeWidth={1.5} />
              </G>
            );
          })}
        </Svg>
        {onCategory ? (
          <View style={StyleSheet.absoluteFill}>
            {rows.map((x) => (
              <Pressable
                key={x.key}
                onPress={() => onCategory(x.id)}
                accessibilityRole="button"
                accessibilityLabel={t.charts.barA11y(x.name, formatMoney(x.spent, m.currency), formatMoney(x.cap, m.currency))}
                style={({ pressed }) => [{ height: rowH }, pressed && { backgroundColor: c.fill }]}
              />
            ))}
          </View>
        ) : null}
      </Mirror>
      <Text style={[s.caption, { color: c.secondaryLabel }]}>{t.charts.legend}</Text>
    </ChartCard>
  );
}

function LineChart({
  points,
  currency,
  color,
  onPoint,
}: {
  points: { label: string; v: number; a11y?: string }[];
  currency: string;
  color: string;
  onPoint?: (i: number) => void;
}) {
  const c = useColors();
  const w = useChartWidth();
  const h = 120;
  const pad = { l: 8, r: 8, t: 16, b: 22 };
  const max = Math.max(1, ...points.map((p) => p.v));
  const min = Math.min(0, ...points.map((p) => p.v));
  const rtl = isRTL();
  const step = (i: number) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, points.length - 1);
  const x = (i: number) => (rtl ? w - step(i) : step(i));
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min || 1)) * (h - pad.t - pad.b);
  const last = points[points.length - 1];
  return (
    <Mirror>
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
          <SvgText fontFamily={FONT} x={x(points.length - 1)} y={y(last.v) - 8} fontSize={11} textAnchor={rtl ? 'start' : 'end'} fill={c.label as string}>
            {formatMoney(last.v, currency)}
          </SvgText>
        ) : null}
      </Svg>
      {onPoint ? (
        // one column per point, centred on it
        <View style={StyleSheet.absoluteFill}>
          {points.map((p, i) => {
            const colW = (w - pad.l - pad.r) / Math.max(1, points.length - 1);
            return (
              <Pressable
                key={p.label}
                onPress={() => onPoint(i)}
                accessibilityRole="button"
                accessibilityLabel={p.a11y ?? p.label}
                style={({ pressed }) => [
                  { position: 'absolute', top: 0, bottom: 0, left: x(i) - colW / 2, width: colW, borderRadius: 8 },
                  pressed && { backgroundColor: c.fill },
                ]}
              />
            );
          })}
        </View>
      ) : null}
    </Mirror>
  );
}

// 3. Six-month spending trend; a month opens its Overview.
export function TrendLine({ m, onMonth }: { m: ReportMetrics; onMonth?: (month: string) => void }) {
  const c = useColors();
  // D1: months before the household started (nothing spent yet) aren't a flat line of zeros.
  const first = m.trend.findIndex((p) => p.spent !== 0);
  const trend = first > 0 ? m.trend.slice(first) : m.trend;
  const points = trend.map((p) => ({
    label: monthShort(p.month),
    v: p.spent,
    a11y: t.charts.pointA11y(monthLong(p.month), formatMoney(p.spent, m.currency)),
  }));
  return (
    <ChartCard title={t.charts.trend}>
      <LineChart
        points={points}
        currency={m.currency}
        color={c.tint as string}
        onPoint={onMonth ? (i) => onMonth(`${trend[i].month.slice(0, 7)}-01`) : undefined}
      />
    </ChartCard>
  );
}

// 4. Savings balance over time.
export function SavingsLine({ m }: { m: ReportMetrics }) {
  const c = useColors();
  return (
    <ChartCard title={t.charts.savings}>
      <LineChart points={m.savings_trend.map((p) => ({ label: monthShort(p.month), v: p.balance }))} currency={m.currency} color={c.green as string} />
    </ChartCard>
  );
}

// P1-11: one category's last months on its screen. Bars are what was spent, the tick on each
// is that month's budget, the dashed line the average of the months before this one. A bar
// opens that month's expenses in the category.
export function CategoryTrend({ months, currency, onMonth }: { months: TrendMonth[]; currency: string; onMonth?: (month: string) => void }) {
  const c = useColors();
  const w = useChartWidth();
  if (months.length === 0) return null;
  const h = 120;
  const pad = { t: 10, b: 22 };
  const max = Math.max(1, ...months.map((x) => Math.max(x.spent, x.cap ?? 0)));
  const rtl = isRTL();
  const colW = w / months.length;
  const barW = Math.min(28, colW * 0.55);
  const at = (i: number) => (rtl ? w - (i + 1) * colW : i * colW);
  const y = (v: number) => pad.t + (1 - Math.max(0, v) / max) * (h - pad.t - pad.b);
  const { now, avg, pct } = trendSummary(months);
  return (
    <ChartCard title={t.charts.categoryTrend}>
      <Text style={[s.caption, { color: c.secondaryLabel }]}>
        {pct != null ? t.charts.avgVsNow(formatMoney(avg, currency), formatMoney(now, currency), pct) : t.charts.nowOnly(formatMoney(now, currency))}
      </Text>
      <Mirror>
        <Svg width={w} height={h}>
          {months.map((x, i) => {
            const cx = at(i) + colW / 2;
            const last = i === months.length - 1;
            const over = x.cap != null && x.cap > 0 && x.spent > x.cap;
            return (
              <G key={x.month}>
                <Rect
                  x={cx - barW / 2}
                  y={y(x.spent)}
                  width={barW}
                  height={Math.max(1, y(0) - y(x.spent))}
                  rx={4}
                  fill={over ? (c.red as string) : (c.tint as string)}
                  fillOpacity={over || last ? 1 : 0.35}
                />
                {x.cap != null && x.cap > 0 ? (
                  <Line x1={cx - barW / 2 - 3} x2={cx + barW / 2 + 3} y1={y(x.cap)} y2={y(x.cap)} stroke={c.secondaryLabel as string} strokeWidth={1.5} />
                ) : null}
                <SvgText fontFamily={FONT} x={cx} y={h - 6} fontSize={11} textAnchor="middle" fill={c.secondaryLabel as string}>
                  {monthShort(x.month)}
                </SvgText>
              </G>
            );
          })}
          {avg > 0 ? (
            <Line x1={0} x2={w} y1={y(avg)} y2={y(avg)} stroke={c.tint as string} strokeWidth={1} strokeDasharray="4 4" />
          ) : null}
        </Svg>
        {onMonth ? (
          <View style={StyleSheet.absoluteFill}>
            {months.map((x, i) => (
              <Pressable
                key={x.month}
                onPress={() => onMonth(x.month)}
                accessibilityRole="button"
                accessibilityLabel={t.charts.monthBarA11y(
                  monthLong(x.month),
                  formatMoney(x.spent, currency),
                  x.cap ? formatMoney(x.cap, currency) : null,
                )}
                style={({ pressed }) => [
                  { position: 'absolute', top: 0, bottom: 0, left: at(i), width: colW, borderRadius: 8 },
                  pressed && { backgroundColor: c.fill },
                ]}
              />
            ))}
          </View>
        ) : null}
      </Mirror>
    </ChartCard>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 16, borderRadius: 14, padding: 16, gap: 12 },
  title: { fontFamily: fontFamily.body, fontSize: 17, fontWeight: '600' },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legend: { flex: 1, gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontFamily: fontFamily.body, flex: 1, fontSize: 13 },
  legendPct: { fontFamily: fontFamily.body, fontSize: 13, fontVariant: ['tabular-nums'] },
  caption: { fontFamily: fontFamily.body, fontSize: 13 },
});
