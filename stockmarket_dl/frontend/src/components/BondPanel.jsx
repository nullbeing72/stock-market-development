import React, { useEffect, useState } from 'react'
import {
  ComposedChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { fetchBonds } from '../api.js'

const axisStyle = { fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, fill: '#8c97a4' }
const gridStyle = { stroke: '#e2e6ea', strokeDasharray: '4 4' }

const COL_COLORS = {
  US_5Y:        '#38bdf8',
  US_10Y:       '#f472b6',
  India_10Y:    '#fbbf24',
  Germany_10Y:  '#4ade80',
  UK_10Y:       '#a78bfa',
  Japan_10Y:    '#f87171',
}

const COL_LABELS = {
  US_5Y:        'US 5Y',
  US_10Y:       'US 10Y',
  India_10Y:    'India 10Y',
  Germany_10Y:  'Germany 10Y',
  UK_10Y:       'UK 10Y',
  Japan_10Y:    'Japan 10Y',
}

const COUNTRY_FLAG = {
  'United States':  '🇺🇸',
  'India':          '🇮🇳',
  'Germany':        '🇩🇪',
  'United Kingdom': '🇬🇧',
  'Japan':          '🇯🇵',
}

function round2(n) { return Math.round(n * 100) / 100 }

function YieldCard({ country, tenors }) {
  const flag  = COUNTRY_FLAG[country] ?? '🌐'
  const t10   = tenors['10Y']
  const t5    = tenors['5Y']
  const spread = t10 != null && t5 != null ? round2(t10 - t5) : null
  return (
    <div className="metric-card" style={{ minWidth: 148, flex: '1 1 148px' }}>
      <div className="metric-label">{flag} {country}</div>
      {t10 != null && (
        <div className="metric-value" style={{ fontSize: '1.3rem', color: 'var(--cyan)' }}>
          {t10.toFixed(2)}%
          <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginLeft: 4 }}>10Y</span>
        </div>
      )}
      {t5 != null && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
          5Y: {t5.toFixed(2)}%
        </div>
      )}
      {spread != null && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.65rem', marginTop: 3,
          color: spread < 0 ? 'var(--red)' : 'var(--green)',
        }}>
          Spread: {spread >= 0 ? '+' : ''}{spread.toFixed(2)}%
          {spread < 0 && ' ⚠ inv.'}
        </div>
      )}
    </div>
  )
}

export default function BondPanel({ period = 730 }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    setLoading(true); setError(null)
    fetchBonds(period)
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [period])

  if (loading) return <div className="status-msg"><span className="status-dot" />Loading global bond yield data…</div>
  if (error)   return <div className="error-msg">⚠ {error}</div>
  if (!data?.rows?.length) return <div className="status-msg">Bond yield data not available for this period.</div>

  const { rows, columns = [], latest = {}, countries = {} } = data
  const availableCols = (columns.length ? columns : Object.keys(COL_COLORS)).filter(c => COL_COLORS[c])

  const us5y     = latest.US_5Y
  const us10y    = latest.US_10Y
  const spread   = latest.spread
  const inverted = latest.inverted

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: '0.75rem', letterSpacing: '0.05em' }}>
        Source: Yahoo Finance (US 5Y/10Y) · ETF-anchored proxies (India, Germany, UK, Japan) · Anchors: IN ~6.8% · DE ~2.45% · GB ~4.4% · JP ~1.1%
      </div>

      {/* Country yield cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginBottom: '0.85rem' }}>
        {Object.entries(countries).map(([country, tenors]) => (
          <YieldCard key={country} country={country} tenors={tenors} />
        ))}
      </div>

      {/* US curve inversion alert */}
      {us5y != null && us10y != null && (
        <div style={{
          background: inverted ? 'rgba(248,113,113,0.06)' : 'rgba(74,222,128,0.04)',
          border: `1px solid ${inverted ? 'rgba(248,113,113,0.25)' : 'rgba(74,222,128,0.15)'}`,
          borderRadius: 6, padding: '0.55rem 1rem', marginBottom: '0.75rem',
          fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
          color: inverted ? 'var(--red)' : 'var(--green)', lineHeight: 1.6,
        }}>
          {inverted
            ? `⚠ US yield curve INVERTED — 10Y (${us10y.toFixed(2)}%) < 5Y (${us5y.toFixed(2)}%). Spread: ${spread?.toFixed(2)}%. Historically precedes recessions by 6–18 months.`
            : `✓ US yield curve normal — 10Y (${us10y.toFixed(2)}%) > 5Y (${us5y.toFixed(2)}%). Spread: +${spread?.toFixed(2)}%.`}
        </div>
      )}

      {/* Global yields chart */}
      {availableCols.length > 0 && (
        <div className="chart-wrap" style={{ marginBottom: '0.75rem' }}>
          <div className="chart-title">Global Government Bond Yields — Historical</div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={rows} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridStyle} />
              <XAxis dataKey="date" tick={axisStyle} minTickGap={55} />
              <YAxis tick={axisStyle} width={54} tickFormatter={v => `${Number(v).toFixed(2)}%`} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e2e6ea', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#1a2332' }}
                formatter={(v, name) => v != null ? [`${Number(v).toFixed(3)}%`, COL_LABELS[name] ?? name] : ['—', name]}
              />
              <Legend
                wrapperStyle={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: '#8c97a4' }}
                formatter={name => COL_LABELS[name] ?? name}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.05)" />
              {availableCols.map(col => (
                <Line
                  key={col}
                  dataKey={col}
                  stroke={COL_COLORS[col]}
                  dot={false}
                  strokeWidth={col === 'US_10Y' || col === 'India_10Y' ? 2 : 1.5}
                  strokeDasharray={col.endsWith('5Y') ? '5 3' : undefined}
                  connectNulls
                  name={col}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* US spread chart */}
      {us5y != null && us10y != null && (
        <div className="chart-wrap" style={{ marginBottom: '0.75rem' }}>
          <div className="chart-title">US Yield Curve Spread (10Y − 5Y)</div>
          <ResponsiveContainer width="100%" height={130}>
            <ComposedChart
              data={rows.map(r => ({
                date:   r.date,
                spread: r.US_10Y != null && r.US_5Y != null ? round2(r.US_10Y - r.US_5Y) : null,
              }))}
              margin={{ top: 5, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid {...gridStyle} />
              <XAxis dataKey="date" tick={axisStyle} minTickGap={55} />
              <YAxis tick={axisStyle} width={54} tickFormatter={v => `${Number(v).toFixed(2)}%`} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e2e6ea', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#1a2332' }}
                formatter={v => v != null ? [`${Number(v).toFixed(3)}%`, 'Spread'] : ['—', 'Spread']}
              />
              <ReferenceLine y={0} stroke="rgba(248,113,113,0.4)" strokeDasharray="4 2"
                label={{ value: 'Inversion threshold', position: 'insideTopLeft',
                  style: { fontSize: 8, fill: 'rgba(248,113,113,0.5)', fontFamily: 'JetBrains Mono, monospace' } }}
              />
              <Area dataKey="spread" stroke="var(--amber)" fill="rgba(251,176,59,0.08)"
                dot={false} strokeWidth={1.5} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary table */}
      <div className="chart-wrap" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr><th>Instrument</th><th>Latest Yield</th><th>Country</th></tr>
          </thead>
          <tbody>
            {availableCols.map(col => {
              const val = latest[col]
              const countryMap = {
                US_5Y: 'United States', US_10Y: 'United States',
                India_10Y: 'India', Germany_10Y: 'Germany',
                UK_10Y: 'United Kingdom', Japan_10Y: 'Japan',
              }
              const country = countryMap[col] ?? '—'
              return (
                <tr key={col}>
                  <td style={{ color: COL_COLORS[col], fontWeight: 500 }}>{COL_LABELS[col] ?? col}</td>
                  <td style={{ color: 'var(--text-bright)', fontFamily: 'var(--font-mono)' }}>
                    {val != null ? `${Number(val).toFixed(3)}%` : '—'}
                  </td>
                  <td style={{ color: 'var(--text-dim)' }}>
                    {COUNTRY_FLAG[country] ?? ''} {country}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
