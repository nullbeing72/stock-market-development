import React from 'react'
import {
  LineChart, Line, ComposedChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

const axisStyle = { fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, fill: '#8c97a4' }
const gridStyle = { stroke: '#e2e6ea', strokeDasharray: '4 4' }

const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#ffffff', border: '1px solid #e2e6ea', borderRadius: 6,
      padding: '0.5rem 0.8rem', fontFamily: 'JetBrains Mono, monospace',
      fontSize: '0.65rem', color: '#1a2332', boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
    }}>
      <div style={{ color: '#8c97a4', marginBottom: 3, fontSize: '0.58rem' }}>{label}</div>
      {payload.filter(p => p.value != null).map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: 2 }}>
          <span style={{ color: '#5a6472' }}>{p.name}</span>
          <span style={{ fontWeight: 500 }}>
            {typeof p.value === 'number' ? p.value.toFixed(6) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export function LossChart({ lossData }) {
  if (!lossData?.length) return null

  const bestIdx   = lossData.reduce((best, d, i) => d.val < lossData[best].val ? i : best, 0)
  const bestEpoch = lossData[bestIdx]?.epoch

  return (
    <div className="chart-wrap">
      <div className="chart-title">
        <span>Training &amp; Validation Loss</span>
        <span style={{ color: 'var(--amber)', fontSize: '0.58rem' }}>
          ◆ Best epoch: {bestEpoch}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={lossData} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridStyle} />
          <XAxis
            dataKey="epoch" tick={axisStyle}
            label={{ value: 'Epoch', position: 'insideBottomRight', offset: -8, style: { ...axisStyle, fill: '#445566' } }}
          />
          <YAxis tick={axisStyle} width={68} tickFormatter={v => v.toFixed(4)} />
          <Tooltip content={<DarkTooltip />} />
          <Legend wrapperStyle={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: '#5a6472' }} />
          <ReferenceLine
            x={bestEpoch} stroke="rgba(251,176,59,0.35)" strokeDasharray="5 3"
            label={{ value: `▼ ${bestEpoch}`, position: 'insideTopRight', style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fill: '#fbb03b' } }}
          />
          <Line dataKey="train" stroke="var(--cyan)"   dot={false} strokeWidth={2}            name="Train Loss" />
          <Line dataKey="val"   stroke="var(--purple)"  dot={false} strokeWidth={2} strokeDasharray="5 2" name="Val Loss" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function MacdChart({ charts }) {
  const macdData = React.useMemo(() => (
    (charts?.historical ?? [])
      .filter(d => d.macd != null && d.macd_sig != null)
      .map(d => ({
        date:      d.date,
        macd:      d.macd,
        signal:    d.macd_sig,
        histogram: parseFloat((d.macd - d.macd_sig).toFixed(6)),
      }))
  ), [charts])

  if (!macdData.length) return (
    <div className="chart-wrap" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>
      MACD data not available — run analysis first
    </div>
  )

  return (
    <div className="chart-wrap">
      <div className="chart-title">
        <span>MACD — Moving Average Convergence / Divergence</span>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.58rem' }}>
          <span style={{ color: 'var(--cyan)' }}>— MACD</span>
          <span style={{ color: 'var(--pink)' }}>--- Signal</span>
          <span style={{ color: 'var(--text-dim)' }}>▌ Histogram</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={macdData} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey="date" tick={axisStyle} minTickGap={55} />
          <YAxis tick={axisStyle} width={68} tickFormatter={v => v.toFixed(3)} />
          <Tooltip content={<DarkTooltip />} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.06)" />
          <Bar dataKey="histogram" name="Histogram" isAnimationActive={false}>
            {macdData.map((entry, i) => (
              <Cell key={i} fill={entry.histogram >= 0 ? 'rgba(74,222,128,0.5)' : 'rgba(248,113,113,0.5)'} />
            ))}
          </Bar>
          <Line dataKey="macd"   stroke="var(--cyan)" dot={false} strokeWidth={1.5} name="MACD" />
          <Line dataKey="signal" stroke="var(--pink)"  dot={false} strokeWidth={1.5} strokeDasharray="4 2" name="Signal" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
