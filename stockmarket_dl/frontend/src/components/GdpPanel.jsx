import React, { useEffect, useState } from 'react'
import {
  ComposedChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine,
} from 'recharts'
import { fetchGdp } from '../api.js'

const PALETTE = ['#38bdf8','#4ade80','#f472b6','#fbbf24','#818cf8','#f87171','#a78bfa']

const axisStyle = { fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, fill: '#8c97a4' }
const gridStyle = { stroke: '#e2e6ea', strokeDasharray: '4 4' }

// IMF/World Bank consensus GDP growth estimates (%) — static reference values
const CONSENSUS_GDP = {
  US: 2.5, India: 6.8, China: 4.8,
  EU: 1.2, Japan: 1.0, UK: 0.8, Brazil: 2.2,
}

// Color scale for real GDP values (0–10% range)
function gdpColor(val) {
  if (val >= 5.0) return '#4ade80'
  if (val >= 2.0) return '#fbbf24'
  if (val >= 0.0) return '#f87171'
  return '#818cf8'
}

// Separate color scale for ETF returns (can be −30% to +80%)
function etfColor(val) {
  if (val >= 20)  return '#4ade80'
  if (val >= 5)   return '#fbbf24'
  if (val >= 0)   return '#f87171'
  return '#818cf8'
}

function GdpCard({ country, data }) {
  const etfReturn = data.current_annual_pct
  const consensus = CONSENSUS_GDP[country] ?? null

  return (
    <div className="gdp-card">
      <div className="gdp-country">{country}</div>

      {/* ETF return — clearly labelled as proxy */}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.5rem',
        color: 'var(--text-dim)', marginTop: '0.2rem', letterSpacing: '0.05em',
      }}>
        ETF RETURN PROXY
      </div>
      <div className="gdp-val" style={{ color: etfColor(etfReturn), fontSize: '1.05rem' }}>
        {etfReturn >= 0 ? '+' : ''}{etfReturn.toFixed(1)}%
      </div>

      {/* IMF consensus GDP for honest comparison */}
      {consensus != null && (
        <div style={{
          marginTop: '0.3rem',
          padding: '0.18rem 0.4rem',
          background: 'rgba(74,222,128,0.07)',
          border: '1px solid rgba(74,222,128,0.2)',
          borderRadius: '3px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.54rem',
          color: '#4ade80',
          lineHeight: 1.4,
        }}>
          IMF GDP est: +{consensus.toFixed(1)}%
        </div>
      )}

      <div className="gdp-source" style={{ marginTop: '0.3rem' }}>{data.source}</div>
    </div>
  )
}

export default function GdpPanel({ period = 730, forecastDays = 30, inlineData = null }) {
  const [data,    setData]    = useState(inlineData)
  const [loading, setLoading] = useState(!inlineData)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (inlineData) { setData(inlineData); return }
    setLoading(true)
    fetchGdp(period, forecastDays)
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [period, forecastDays, inlineData])

  if (loading) return <div className="status-msg"><span className="status-dot" />Loading GDP proxy data…</div>
  if (error)   return <div className="error-msg">⚠ {error}</div>
  if (!data || !Object.keys(data).length) return <div className="status-msg">No GDP data available.</div>

  const items     = Object.entries(data)
  const countries = items.map(([c]) => c)

  // Bar chart uses real IMF consensus values — not ETF returns
  const barData = items.map(([country]) => ({
    country,
    consensus: CONSENSUS_GDP[country] ?? 0,
    fill:      gdpColor(CONSENSUS_GDP[country] ?? 0),
  }))

  const maxLen   = Math.max(...items.map(([, d]) => d.forecast_dates?.length ?? 0))
  const fcstRows = Array.from({ length: maxLen }, (_, i) => {
    const row = { date: items[0][1].forecast_dates?.[i] ?? `D${i + 1}` }
    items.forEach(([country, d]) => {
      row[country]         = d.forecast_pct?.[i]  ?? null
      row[country + '_up'] = d.upper_pct?.[i]     ?? null
      row[country + '_dn'] = d.lower_pct?.[i]     ?? null
    })
    return row
  })

  const tableRows = items.map(([country, d]) => {
    const etf       = d.current_annual_pct
    const f30       = d.forecast_pct?.slice(-1)[0] ?? etf
    const consensus = CONSENSUS_GDP[country] ?? null
    return { country, etf, f30, delta: f30 - etf, consensus, source: d.source }
  })

  return (
    <div>
      {/* ── Prominent disclaimer ─────────────────────────────────────────── */}
      <div style={{
        marginBottom: '0.85rem',
        padding: '0.65rem 0.9rem',
        background: 'rgba(251,176,59,0.07)',
        border: '1px solid rgba(251,176,59,0.35)',
        borderRadius: 'var(--r)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.62rem',
        color: 'var(--amber)',
        lineHeight: 1.8,
      }}>
        <strong>⚠ Important — Methodology Note:</strong> Values shown are{' '}
        <strong>annualised 252-day ETF returns</strong> used as a directional
        proxy for economic momentum. They are <strong>not</strong> official GDP
        statistics. ETF returns reflect stock market performance and can be
        10–50× larger than actual GDP growth rates (e.g. SPY +36% ≠ US GDP +36%).
        IMF/World Bank consensus estimates are shown on each card and in the
        bar chart for accurate reference.
      </div>

      <div style={{ marginBottom: '0.65rem', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)' }}>
        ETF return proxy · Holt smoothing · ±1σ confidence bands · IMF consensus shown alongside
      </div>

      {/* ── Cards ─────────────────────────────────────────────────────────── */}
      <div className="gdp-grid">
        {items.map(([country, d]) => (
          <GdpCard key={country} country={country} data={d} />
        ))}
      </div>

      {/* ── Bar chart — IMF consensus GDP (accurate, not ETF proxy) ─────── */}
      <div className="chart-wrap" style={{ marginBottom: '0.75rem' }}>
        <div className="chart-title">
          <span>IMF Consensus GDP Growth Estimates (%)</span>
          <span style={{ fontSize: '0.56rem', color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
            ✓ Official estimates — not ETF proxy values
          </span>
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridStyle} />
            <XAxis dataKey="country" tick={axisStyle} />
            <YAxis
              tick={axisStyle} width={42}
              domain={[0, 10]}
              tickFormatter={v => `${v.toFixed(1)}%`}
            />
            <Tooltip
              contentStyle={{ background: '#ffffff', border: '1px solid #e2e6ea', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#1a2332' }}
              formatter={v => [`${v.toFixed(2)}%`, 'IMF GDP Est.']}
            />
            <ReferenceLine y={2} stroke="rgba(251,176,59,0.35)" strokeDasharray="4 2"
              label={{ value: 'Developed world avg ~2%', position: 'insideTopLeft',
                style: { fontSize: 8, fill: 'rgba(251,176,59,0.65)', fontFamily: 'JetBrains Mono, monospace' } }}
            />
            <Bar dataKey="consensus" name="IMF GDP Est. %">
              {barData.map((entry, i) => <Cell key={i} fill={entry.fill} fillOpacity={0.85} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── ETF momentum trend chart — clearly labelled as proxy ────────── */}
      <div className="chart-wrap" style={{ marginBottom: '0.75rem' }}>
        <div className="chart-title">
          <span>ETF Return Momentum — 30-Session Trend with ±1σ Bands</span>
          <span style={{ fontSize: '0.55rem', color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>
            ⚠ Proxy only — not GDP
          </span>
        </div>
        <div style={{
          marginBottom: '0.45rem', padding: '0.3rem 0.6rem',
          background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)',
          borderRadius: 4, fontFamily: 'var(--font-mono)',
          fontSize: '0.57rem', color: 'var(--red)', lineHeight: 1.6,
        }}>
          Y-axis shows annualised ETF returns — large values (e.g. 30–80%) reflect
          bull-market momentum, <strong>not</strong> actual economic output growth.
        </div>
        <ResponsiveContainer width="100%" height={210}>
          <ComposedChart data={fcstRows} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridStyle} />
            <XAxis dataKey="date" tick={axisStyle} minTickGap={30} />
            <YAxis tick={axisStyle} width={52} tickFormatter={v => `${v.toFixed(0)}%`} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const lines = payload.filter(p =>
                  p.value != null &&
                  !p.dataKey.endsWith('_up') &&
                  !p.dataKey.endsWith('_dn')
                )
                if (!lines.length) return null
                return (
                  <div style={{
                    background: '#ffffff', border: '1px solid #e2e6ea', borderRadius: 6,
                    padding: '0.4rem 0.7rem', fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.64rem', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', minWidth: 170,
                  }}>
                    <div style={{ color: '#8c97a4', fontSize: '0.57rem', marginBottom: '0.2rem' }}>{label}</div>
                    <div style={{ color: '#f87171', fontSize: '0.54rem', marginBottom: '0.25rem' }}>
                      ETF return proxy (≠ GDP)
                    </div>
                    {lines.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '1.2rem', padding: '1px 0' }}>
                        <span style={{ color: p.color }}>{p.name}</span>
                        <span style={{ color: '#1a2332', fontWeight: 600 }}>
                          {Number(p.value) >= 0 ? '+' : ''}{Number(p.value).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )
              }}
            />
            <Legend wrapperStyle={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.58rem', color: '#8c97a4', paddingTop: '4px', lineHeight: 1.6 }} />
            <ReferenceLine y={0} stroke="rgba(248,113,113,0.3)" strokeDasharray="4 2" />
            {countries.map((country, i) => {
              const color = PALETTE[i % PALETTE.length]
              return (
                <React.Fragment key={country}>
                  <Area dataKey={country + '_up'} stroke="transparent" fill={color + '10'} dot={false} activeDot={false} legendType="none" />
                  <Area dataKey={country + '_dn'} stroke="transparent" fill={color + '10'} dot={false} activeDot={false} legendType="none" />
                  <Line dataKey={country} stroke={color} dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: color }} strokeWidth={2} name={country} />
                </React.Fragment>
              )
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Summary table — ETF return + IMF consensus side by side ─────── */}
      <div className="chart-wrap" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Country</th>
              <th>ETF Return (Proxy)</th>
              <th>IMF GDP Estimate</th>
              <th>30-Day ETF Trend</th>
              <th>Δ (ETF)</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map(r => (
              <tr key={r.country}>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>{r.country}</td>
                <td style={{ color: etfColor(r.etf), fontFamily: 'var(--font-mono)' }}>
                  {r.etf >= 0 ? '+' : ''}{r.etf.toFixed(2)}%
                </td>
                <td style={{ color: gdpColor(r.consensus ?? 0), fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {r.consensus != null ? `+${r.consensus.toFixed(1)}%` : '—'}
                </td>
                <td style={{ color: etfColor(r.f30), fontFamily: 'var(--font-mono)' }}>
                  {r.f30 >= 0 ? '+' : ''}{r.f30.toFixed(2)}%
                </td>
                <td className={r.delta >= 0 ? 'tbl-pos' : 'tbl-neg'}>
                  {r.delta >= 0 ? '+' : ''}{r.delta.toFixed(2)}%
                </td>
                <td style={{ color: 'var(--text-dim)' }}>{r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{
          marginTop: '0.6rem', fontFamily: 'var(--font-mono)',
          fontSize: '0.57rem', color: 'var(--text-dim)', lineHeight: 1.7,
        }}>
          IMF GDP estimates are 2024–2025 consensus figures (static reference).
          ETF return proxy values are live market data reflecting investor sentiment.
          For official statistics refer to IMF World Economic Outlook or World Bank Open Data.
        </div>
      </div>
    </div>
  )
}
