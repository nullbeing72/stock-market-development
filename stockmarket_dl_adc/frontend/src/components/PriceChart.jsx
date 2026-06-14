import React, { useMemo, useState } from 'react'
import {
  ComposedChart, Line, Area, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

const COLORS = {
  historical: '#38bdf8',
  actual:     '#7dd3fc',
  predicted:  '#f472b6',
  forecast:   '#4ade80',
  bb:         'rgba(167,139,250,0.25)',
  volume:     '#1e2d45',
  rsi:        '#fbb03b',
}

const axisStyle = { fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, fill: '#8c97a4' }
const gridStyle = { stroke: '#e2e6ea', strokeDasharray: '4 4' }

const SERIES_CONFIG = {
  'Historical':       { color: '#38bdf8', show: true },
  'Actual (test)':    { color: '#7dd3fc', show: true },
  'Predicted (test)': { color: '#f472b6', show: true },
  'MC Forecast':      { color: '#4ade80', show: true },
  'Fcst ±σ':          { color: '#a78bfa', show: false },
  'BB Upper':         { color: '#a78bfa', show: false },
  'BB Lower':         { color: '#a78bfa', show: false },
}

const HIDDEN_DATAKEYS = new Set(['bb_upper', 'bb_lower', 'forecast_upper', 'forecast_lower'])

const PriceTooltip = ({ active, payload, label, currency }) => {
  if (!active || !payload?.length) return null
  const visible = payload.filter(p =>
    p.value != null &&
    !HIDDEN_DATAKEYS.has(p.dataKey) &&
    SERIES_CONFIG[p.name]?.show !== false
  )
  if (!visible.length) return null
  return (
    <div style={{
      background: '#ffffff', border: '1px solid #e2e6ea', borderRadius: 6,
      padding: '0.5rem 0.8rem', fontFamily: 'JetBrains Mono, monospace',
      fontSize: '0.66rem', boxShadow: '0 4px 16px rgba(0,0,0,0.10)', minWidth: 160,
    }}>
      <div style={{ color: '#8c97a4', marginBottom: '0.35rem', fontSize: '0.58rem', borderBottom: '1px solid #e2e6ea', paddingBottom: '0.25rem' }}>
        {label}
      </div>
      {visible.map((p, i) => {
        const cfg = SERIES_CONFIG[p.name]
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.2rem', padding: '2px 0' }}>
            <span style={{ color: '#8c97a4' }}>{p.name}</span>
            <span style={{ fontWeight: 700, color: cfg?.color ?? '#1a2332', letterSpacing: '0.02em' }}>
              {p.name === 'Volume'
                ? `${(p.value / 1e6).toFixed(2)}M`
                : `${currency}${Number(p.value).toFixed(2)}`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const RANGES = ['1M', '3M', '6M', '1Y', '2Y', 'ALL']

export default function PriceChart({ charts, currency = '$' }) {
  const [range, setRange] = useState('ALL')

  const allData = useMemo(() => {
    if (!charts) return []
    const map = new Map()
    for (const row of charts.historical ?? []) {
      map.set(row.date, {
        date:     row.date,
        close:    row.close,
        bb_upper: row.bb_upper  ?? null,
        bb_lower: row.bb_lower  ?? null,
        rsi:      row.rsi       ?? null,
        macd:     row.macd      ?? null,
        macd_sig: row.macd_sig  ?? null,
        volume:   row.volume    ?? null,
      })
    }
    for (const row of charts.test ?? []) {
      const ex = map.get(row.date) ?? { date: row.date }
      ex.actual    = row.actual
      ex.predicted = row.predicted
      map.set(row.date, ex)
    }
    for (const row of charts.forecast ?? []) {
      map.set(row.date, {
        date:           row.date,
        forecast_mean:  row.mean,
        forecast_upper: row.upper,
        forecast_lower: row.lower,
      })
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [charts])

  const filtered = useMemo(() => {
    if (range === 'ALL' || !allData.length) return allData
    const cutM = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '2Y': 24 }[range] ?? 0
    const cut  = new Date()
    cut.setMonth(cut.getMonth() - cutM)
    return allData.filter(d => new Date(d.date) >= cut)
  }, [allData, range])

  if (!charts || !allData.length) {
    return (
      <div className="chart-wrap" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>
        No chart data available
      </div>
    )
  }

  // FIX: exclude bb_upper/bb_lower from domain calculation.
  // Wide Bollinger bands on volatile stocks would inflate yMax and compress the
  // visible price chart significantly. The Band Areas have their own visual range.
  const prices = filtered.flatMap(d =>
    [d.close, d.actual, d.predicted, d.forecast_mean, d.forecast_upper, d.forecast_lower]
      .filter(v => v != null && v > 0)
  )
  const yMin = prices.length ? Math.min(...prices) * 0.97 : 0
  const yMax = prices.length ? Math.max(...prices) * 1.03 : 1

  const forecastStart = filtered.find(d => d.forecast_mean != null)?.date

  return (
    <div className="chart-wrap">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div className="chart-title" style={{ margin: 0 }}>Price, Prediction &amp; MC Forecast</div>
        <div style={{ display: 'flex', gap: '0.2rem' }}>
          {RANGES.map(r => (
            <button key={r} className={`range-btn ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
        PRICE &amp; BOLLINGER BANDS
      </div>
      <ResponsiveContainer width="100%" height={270}>
        <ComposedChart data={filtered} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey="date" tick={axisStyle} minTickGap={55} />
          <YAxis
            domain={[yMin, yMax]} tick={axisStyle} width={70}
            tickFormatter={v => `${currency}${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}`}
          />
          <Tooltip content={<PriceTooltip currency={currency} />} />
          <Legend wrapperStyle={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: '#8c97a4', paddingTop: '6px' }} />

          {forecastStart && (
            <ReferenceLine
              x={forecastStart} stroke="rgba(74,222,128,0.25)" strokeDasharray="4 3"
              label={{ value: 'FORECAST ▶', position: 'insideTopLeft', style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 8, fill: 'rgba(74,222,128,0.5)' } }}
            />
          )}

          <Area dataKey="bb_upper" stroke="rgba(167,139,250,0.12)" fill="rgba(167,139,250,0.04)" dot={false} legendType="none" name="BB Upper" />
          <Area dataKey="bb_lower" stroke="rgba(167,139,250,0.12)" fill="rgba(167,139,250,0.04)" dot={false} legendType="none" name="BB Lower" />
          <Area dataKey="forecast_upper" stroke="rgba(74,222,128,0.1)" fill="rgba(74,222,128,0.05)" dot={false} legendType="none" name="Fcst ±σ" />
          <Area dataKey="forecast_lower" stroke="rgba(74,222,128,0.1)" fill="rgba(74,222,128,0.05)" dot={false} legendType="none" />

          <Line dataKey="close"         stroke={COLORS.historical} dot={false} strokeWidth={1.5}  name="Historical" />
          <Line dataKey="actual"        stroke={COLORS.actual}     dot={false} strokeWidth={1}    name="Actual (test)" />
          <Line dataKey="predicted"     stroke={COLORS.predicted}  dot={false} strokeWidth={1.5}  strokeDasharray="5 3" name="Predicted (test)" />
          <Line dataKey="forecast_mean" stroke={COLORS.forecast}   dot={{ r: 3, fill: COLORS.forecast }} strokeWidth={2.5} name="MC Forecast" />
        </ComposedChart>
      </ResponsiveContainer>

      {/* RSI */}
      <div style={{ marginTop: '0.85rem', marginBottom: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
        RSI (14) — Overbought &gt;70 · Oversold &lt;30
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <ComposedChart data={filtered} margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey="date" tick={axisStyle} minTickGap={55} hide />
          <YAxis domain={[0, 100]} tick={axisStyle} width={35} />
          <Tooltip
            contentStyle={{ background: '#ffffff', border: '1px solid #e2e6ea', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.62rem', color: '#1a2332' }}
            formatter={v => [v != null ? v.toFixed(1) : '—', 'RSI']}
            labelStyle={{ color: '#8c97a4', fontSize: '0.58rem' }}
          />
          <ReferenceLine y={70} stroke="rgba(248,113,113,0.3)" strokeDasharray="3 2" label={{ value: '70', position: 'right', style: { fontSize: 8, fill: 'rgba(248,113,113,0.5)' } }} />
          <ReferenceLine y={30} stroke="rgba(74,222,128,0.3)"  strokeDasharray="3 2" label={{ value: '30', position: 'right', style: { fontSize: 8, fill: 'rgba(74,222,128,0.5)' } }} />
          <Area dataKey="rsi" stroke={COLORS.rsi} fill="rgba(251,176,59,0.06)" dot={false} strokeWidth={1.5} name="RSI" />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Volume */}
      <div style={{ marginTop: '0.65rem', marginBottom: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
        VOLUME
      </div>
      <ResponsiveContainer width="100%" height={60}>
        <ComposedChart data={filtered} margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" tick={axisStyle} minTickGap={55} hide />
          <YAxis tick={axisStyle} width={35} tickFormatter={v => `${(v/1e6).toFixed(0)}M`} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const vol = payload[0]?.value
              if (vol == null) return null
              const entry = payload[0]?.payload
              const prev  = filtered[filtered.findIndex(d => d.date === entry?.date) - 1]
              const isUp  = !prev || entry?.close == null || prev?.close == null
                ? true
                : entry.close >= prev.close
              return (
                <div style={{
                  background: '#ffffff', border: '1px solid #e2e6ea', borderRadius: 6,
                  padding: '0.35rem 0.65rem', fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.64rem', boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
                }}>
                  <div style={{ color: '#8c97a4', fontSize: '0.57rem', marginBottom: '0.2rem' }}>{label}</div>
                  <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                    <span style={{ color: '#8c97a4' }}>Volume</span>
                    <span style={{ fontWeight: 700, color: isUp ? '#4ade80' : '#f87171' }}>
                      {(vol / 1e6).toFixed(2)}M
                    </span>
                  </div>
                </div>
              )
            }}
          />
          <Bar dataKey="volume" name="Volume" isAnimationActive={false}>
            {filtered.map((entry, i) => {
              const prev = filtered[i - 1]
              // FIX: only compare close when both entries actually have it
              const isUp = prev == null || entry.close == null || prev.close == null
                ? true
                : entry.close >= prev.close
              return (
                <Cell
                  key={`vol-${i}`}
                  fill={isUp ? 'rgba(74,222,128,0.55)' : 'rgba(248,113,113,0.55)'}
                />
              )
            })}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
