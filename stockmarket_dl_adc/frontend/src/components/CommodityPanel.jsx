// CommodityPanel.jsx — v1.1
// Fixes:
//  - Removed unused COMM_NAMES constant (dead code)
//  - Industry modal now clearly labels all prices as SIMULATED/ILLUSTRATIVE
//    (prices are generated via seeded pseudo-random, not live market data)

import React, { useEffect, useState, useMemo } from 'react'
import {
  ComposedChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { fetchCommodities } from '../api.js'

const PALETTE = ['#fbbf24', '#94a3b8', '#b45309', '#9ca3af', '#60a5fa']

const axisStyle = { fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, fill: '#8c97a4' }
const gridStyle = { stroke: '#e2e6ea', strokeDasharray: '4 4' }

// ── Industry data registry ────────────────────────────────────────────────────
const INDUSTRY_MAP = {
  Gold: [
    { name: 'Gold Mining',              ticker: 'GDX',   sector: 'Materials',          basePrice: 32.5  },
    { name: 'Jewelry & Luxury Goods',   ticker: 'LVMH',  sector: 'Consumer',           basePrice: 285.0 },
    { name: 'Gold ETFs & Finance',      ticker: 'GLD',   sector: 'Finance',            basePrice: 243.5 },
    { name: 'Electronics (Connectors)', ticker: 'AMAT',  sector: 'Technology',         basePrice: 195.2 },
    { name: 'Dental & Medical',         ticker: 'HSIC',  sector: 'Healthcare',         basePrice: 71.3  },
  ],
  Silver: [
    { name: 'Silver Mining',            ticker: 'SIL',   sector: 'Materials',          basePrice: 28.4  },
    { name: 'Solar Energy (PV Cells)',  ticker: 'TAN',   sector: 'Clean Energy',       basePrice: 43.7  },
    { name: 'Electronics & Semis',      ticker: 'TXN',   sector: 'Technology',         basePrice: 197.8 },
    { name: 'Photography & Imaging',    ticker: 'KODK',  sector: 'Technology',         basePrice: 3.2   },
    { name: 'Medical Devices',          ticker: 'MDT',   sector: 'Healthcare',         basePrice: 88.5  },
  ],
  Copper: [
    { name: 'Copper Mining',            ticker: 'FCX',   sector: 'Materials',          basePrice: 47.3  },
    { name: 'Construction & Infra',     ticker: 'XHB',   sector: 'Real Estate',        basePrice: 88.2  },
    { name: 'Electrical Equipment',     ticker: 'ETN',   sector: 'Industrials',        basePrice: 318.0 },
    { name: 'Electric Vehicles',        ticker: 'TSLA',  sector: 'Automotive',         basePrice: 248.5 },
    { name: 'Telecom Infrastructure',   ticker: 'AMT',   sector: 'Telecom',            basePrice: 186.3 },
  ],
  Aluminium: [
    { name: 'Aluminium Smelting',       ticker: 'AA',    sector: 'Materials',          basePrice: 31.5  },
    { name: 'Aerospace & Defense',      ticker: 'BA',    sector: 'Aerospace',          basePrice: 172.4 },
    { name: 'Packaging & Containers',   ticker: 'PKG',   sector: 'Materials',          basePrice: 182.6 },
    { name: 'Automotive Parts',         ticker: 'LEA',   sector: 'Automotive',         basePrice: 94.2  },
    { name: 'Construction Materials',   ticker: 'VMC',   sector: 'Materials',          basePrice: 278.3 },
  ],
  Brent_Oil: [
    { name: 'Airlines',                 ticker: 'UAL',   sector: 'Transportation',     basePrice: 73.5  },
    { name: 'Petrochemicals & Plastics',ticker: 'LYB',   sector: 'Materials',          basePrice: 38.9  },
    { name: 'Oil & Gas Majors',         ticker: 'XOM',   sector: 'Energy',             basePrice: 112.7 },
    { name: 'Shipping & Logistics',     ticker: 'ZIM',   sector: 'Transportation',     basePrice: 18.4  },
    { name: 'Utilities (fuel mix)',     ticker: 'NEE',   sector: 'Utilities',          basePrice: 73.8  },
  ],
}

const SECTOR_SENSITIVITY = {
  Gold:      { Materials: 0.85, Consumer: 0.25, Finance: 0.40, Technology: 0.10, Healthcare: 0.05 },
  Silver:    { Materials: 0.90, 'Clean Energy': 0.65, Technology: 0.20, Healthcare: 0.05 },
  Copper:    { Materials: 0.80, 'Real Estate': 0.55, Industrials: 0.60, Automotive: -0.30, Telecom: -0.10 },
  Aluminium: { Materials: 0.75, Aerospace: -0.35, Industrials: 0.50, Automotive: -0.25 },
  Brent_Oil: { Transportation: -0.75, Materials: 0.50, Energy: 0.90, Utilities: -0.45 },
}

function seeded(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

function strSeed(s) {
  return s.split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0)
}

function generateIndustryRows(commodityName, commodityPct1d, forecastDays) {
  const industries = INDUSTRY_MAP[commodityName] ?? []
  const baseSeed   = strSeed(commodityName) + strSeed(new Date().toDateString())
  const sensMap    = SECTOR_SENSITIVITY[commodityName] ?? {}
  const commPct    = (commodityPct1d ?? 0) / 100

  return industries.map((ind, i) => {
    const s = baseSeed + i * 137
    const variation    = (seeded(s) - 0.5) * 0.08
    const currentPrice = +(ind.basePrice * (1 + variation)).toFixed(2)
    const sensitivity  = sensMap[ind.sector] ?? 0.15
    const modelNoise   = (seeded(s + 500) - 0.5) * 0.008
    const predDelta    = commPct * sensitivity + modelNoise
    const predictedPrice = +(currentPrice * (1 + predDelta)).toFixed(2)
    const isBullish    = predictedPrice > currentPrice
    const absPctError  = +Math.abs((predictedPrice - currentPrice) / currentPrice * 100).toFixed(2)

    const forecast = []
    let fp = predictedPrice
    for (let d = 0; d < forecastDays; d++) {
      const drift = (seeded(s + d * 71 + 1000) - 0.49) * 0.014
      fp = +(fp * (1 + drift)).toFixed(2)
      forecast.push(fp)
    }

    return { ...ind, currentPrice, predictedPrice, isBullish, absPctError, forecast }
  })
}

// ── Industries Modal ─────────────────────────────────────────────────────────
function IndustriesModal({ commodity, commodityData, onClose }) {
  const [days, setDays] = useState(5)

  const rows = useMemo(
    () => generateIndustryRows(commodity, commodityData?.pct_change_1d ?? 0, days),
    [commodity, commodityData, days],
  )

  const dateLabels = useMemo(() =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() + i + 1)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }),
    [days],
  )

  const handleOverlay = e => { if (e.target === e.currentTarget) onClose() }

  return (
    <div className="ind-modal-overlay" onClick={handleOverlay}>
      <div className="ind-modal-box">
        <button className="modal-close" onClick={onClose}>✕ Close</button>

        <div className="ind-modal-title">🏭 {commodity} — Related Industries</div>
        <div className="ind-modal-sub">
          Sector impact analysis · {days}-day forward forecast
        </div>

        {/* FIX: Prominent simulated-data disclaimer */}
        <div style={{
          background: 'rgba(251,176,59,0.07)',
          border: '1px solid rgba(251,176,59,0.3)',
          borderRadius: 6,
          padding: '0.5rem 0.85rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.62rem',
          color: 'var(--amber)',
          marginBottom: '1rem',
          lineHeight: 1.6,
        }}>
          ⚠ <strong>Illustrative / Simulated Data.</strong> Industry prices below are generated
          from sector-sensitivity models seeded by today's date — they are <em>not</em> live
          market quotes. They illustrate which sectors are historically affected by {commodity}{' '}
          price movements and in what direction. Do not use as financial advice.
        </div>

        {/* Forecast day selector */}
        <div className="ind-day-selector">
          <span className="ind-day-label">Forecast Horizon:</span>
          {[3, 5, 7, 10, 14].map(d => (
            <button
              key={d}
              className={`range-btn ${days === d ? 'active' : ''}`}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>

        {/* Sector impact table */}
        <div className="chart-wrap" style={{ marginBottom: '1.25rem', overflowX: 'auto' }}>
          <div className="chart-title">
            <span>Simulated Sector Impact — Price Direction</span>
            <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.58rem' }}>
              <span style={{ color: 'var(--green)' }}>▌ Positive Impact</span>
              <span style={{ color: 'var(--red)' }}>▌ Negative Impact</span>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Industry</th>
                <th>Sector</th>
                <th>Base Price (est.)</th>
                <th>Simulated Impact Price</th>
                <th>Abs. % Impact</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.name}>
                  <td>
                    <span style={{ color: 'var(--text-bright)', fontWeight: 500 }}>{r.name}</span>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.6rem', marginLeft: '0.4rem', fontFamily: 'var(--font-mono)' }}>
                      ({r.ticker})
                    </span>
                  </td>
                  <td>
                    <span style={{
                      background: 'var(--bg-raised)', border: '1px solid var(--border)',
                      borderRadius: '3px', padding: '1px 6px',
                      fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)',
                    }}>
                      {r.sector}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                    ${r.currentPrice.toFixed(2)}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    <span style={{ color: r.isBullish ? 'var(--green)' : 'var(--red)' }}>
                      ${r.predictedPrice.toFixed(2)}&nbsp;
                      <span style={{ fontSize: '0.7rem' }}>{r.isBullish ? '▲' : '▼'}</span>
                    </span>
                  </td>
                  <td>
                    <span className={r.isBullish ? 'ind-err-pos' : 'ind-err-neg'}>
                      {r.absPctError.toFixed(2)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Forecast horizon table */}
        <div className="ind-forecast-section">
          <div className="ind-forecast-title">
            📅 {days}-Day Simulated Forward Prices per Industry
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>Industry</th>
                  {dateLabels.map(d => <th key={d} style={{ whiteSpace: 'nowrap' }}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.name}>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.66rem' }}>
                      {r.name}
                    </td>
                    {r.forecast.map((fp, i) => {
                      const prev = i === 0 ? r.predictedPrice : r.forecast[i - 1]
                      const up   = fp >= prev
                      return (
                        <td key={i} style={{
                          color: up ? 'var(--green)' : 'var(--red)',
                          fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                          fontWeight: 500, whiteSpace: 'nowrap',
                        }}>
                          ${fp.toFixed(2)}
                          <span style={{ fontSize: '0.52rem', marginLeft: 2 }}>{up ? '↑' : '↓'}</span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{
          marginTop: '1.1rem', fontFamily: 'var(--font-mono)',
          fontSize: '0.57rem', color: 'var(--text-dim)', lineHeight: 1.7,
          borderTop: '1px solid var(--border)', paddingTop: '0.75rem',
        }}>
          ⚠ All prices are illustrative simulations based on commodity-sector sensitivity
          coefficients. For educational purposes only — not financial advice.
        </div>
      </div>
    </div>
  )
}

// ── CommCard with Industries button ──────────────────────────────────────────
function pctColor(v) {
  if (v >  1) return 'var(--green)'
  if (v >  0) return '#4ade80aa'
  if (v < -1) return 'var(--red)'
  if (v <  0) return '#f87171aa'
  return 'var(--text-dim)'
}

function CommCard({ name, data, color, onIndustries }) {
  const pct = data.pct_change_1d ?? 0
  return (
    <div className="comm-card">
      <div className="comm-card-top">
        <div className="comm-name" style={{ color }}>{name}</div>
        <button
          className="comm-industries-btn"
          onClick={() => onIndustries(name)}
          title={`View industries affected by ${name}`}
        >
          🏭
        </button>
      </div>
      <div className="comm-price">
        ${data.last_price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className="comm-delta" style={{ color: pctColor(pct) }}>
        {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}% (1d)
      </div>
    </div>
  )
}

// ── Main CommodityPanel ───────────────────────────────────────────────────────
export default function CommodityPanel({ period = 730, forecastDays = 10 }) {
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [modalComm, setModalComm] = useState(null)

  useEffect(() => {
    setLoading(true); setError(null)
    fetchCommodities(period, forecastDays)
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [period, forecastDays])

  if (loading) return <div className="status-msg"><span className="status-dot" />Loading commodity data…</div>
  if (error)   return <div className="error-msg">⚠ {error}</div>
  if (!data || !Object.keys(data).length) return <div className="status-msg">Commodity data not available.</div>

  const entries = Object.entries(data)

  const maxLen  = Math.max(...entries.map(([, d]) => d.dates?.length ?? 0))
  const fcstRows = Array.from({ length: maxLen }, (_, i) => {
    const row = { date: entries[0]?.[1]?.dates?.[i] ?? `D${i + 1}` }
    entries.forEach(([name, d]) => {
      row[name]        = d.means?.[i]  ?? null
      row[name + '_u'] = d.upper?.[i]  ?? null
      row[name + '_l'] = d.lower?.[i]  ?? null
    })
    return row
  })

  const histLen  = Math.max(...entries.map(([, d]) => d.history_prices?.length ?? 0))
  const histRows = Array.from({ length: histLen }, (_, i) => {
    const row = { date: entries[0]?.[1]?.history_dates?.[i] ?? `H${i + 1}` }
    entries.forEach(([name, d]) => {
      const offset = histLen - (d.history_prices?.length ?? 0)
      row[name] = i >= offset ? (d.history_prices?.[i - offset] ?? null) : null
    })
    return row
  })

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
        Holt-Winters double exponential smoothing · Yahoo Finance futures data ·
        Click <span style={{ color: 'var(--amber)' }}>🏭</span> to explore related industries (illustrative)
      </div>

      {/* Commodity cards */}
      <div className="comm-grid">
        {entries.map(([name, d], i) => (
          <CommCard
            key={name}
            name={name}
            data={d}
            color={PALETTE[i % PALETTE.length]}
            onIndustries={setModalComm}
          />
        ))}
      </div>

      {/* Historical prices chart */}
      {histRows.length > 0 && (
        <div className="chart-wrap" style={{ marginBottom: '0.75rem' }}>
          <div className="chart-title">Historical Prices (Last 90 Sessions)</div>
          <ResponsiveContainer width="100%" height={210}>
            <ComposedChart data={histRows} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridStyle} />
              <XAxis dataKey="date" tick={axisStyle} minTickGap={45} />
              <YAxis tick={axisStyle} width={62} tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}`} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e2e6ea', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#1a2332' }}
                formatter={(v, name) => v != null ? [`$${Number(v).toFixed(2)}`, name] : ['—', name]}
              />
              <Legend wrapperStyle={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: '#8c97a4' }} />
              {entries.map(([name], i) => (
                <Line key={name} dataKey={name} stroke={PALETTE[i % PALETTE.length]} dot={false} strokeWidth={1.5} name={name} connectNulls />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Forecast chart */}
      <div className="chart-wrap" style={{ marginBottom: '0.75rem' }}>
        <div className="chart-title">{forecastDays}-Session Forward Forecast with ±1σ Bands</div>
        <ResponsiveContainer width="100%" height={210}>
          <ComposedChart data={fcstRows} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridStyle} />
            <XAxis dataKey="date" tick={axisStyle} minTickGap={30} />
            <YAxis tick={axisStyle} width={62} tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}`} />
            <Tooltip
              contentStyle={{ background: '#ffffff', border: '1px solid #e2e6ea', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#1a2332' }}
              formatter={(v, name) => v != null ? [`$${Number(v).toFixed(2)}`, name] : ['—', name]}
            />
            <Legend wrapperStyle={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: '#8c97a4' }} />
            {entries.map(([name], i) => {
              const color = PALETTE[i % PALETTE.length]
              return (
                <React.Fragment key={name}>
                  <Area dataKey={name + '_u'} stroke="transparent" fill={color + '12'} dot={false} legendType="none" />
                  <Area dataKey={name + '_l'} stroke="transparent" fill={color + '12'} dot={false} legendType="none" />
                  <Line dataKey={name} stroke={color} dot={false} strokeWidth={1.8} name={name} />
                </React.Fragment>
              )
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table */}
      <div className="chart-wrap" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr><th>Commodity</th><th>Last Price</th><th>1d Forecast</th><th>Δ%</th><th>α</th><th>β</th><th>Industries</th></tr>
          </thead>
          <tbody>
            {entries.map(([name, d], i) => {
              const pct = d.pct_change_1d ?? 0
              return (
                <tr key={name}>
                  <td style={{ color: PALETTE[i % PALETTE.length], fontWeight: 500 }}>{name}</td>
                  <td>${d.last_price?.toFixed(2)}</td>
                  <td>${d.means?.[0]?.toFixed(2) ?? '—'}</td>
                  <td className={pct >= 0 ? 'tbl-pos' : 'tbl-neg'}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</td>
                  <td style={{ color: 'var(--text-dim)' }}>{d.alpha}</td>
                  <td style={{ color: 'var(--text-dim)' }}>{d.beta}</td>
                  <td>
                    <button
                      className="comm-industries-btn"
                      onClick={() => setModalComm(name)}
                      title={`View ${name} related industries (illustrative)`}
                    >
                      🏭 View
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Industries modal */}
      {modalComm && (
        <IndustriesModal
          commodity={modalComm}
          commodityData={data[modalComm]}
          onClose={() => setModalComm(null)}
        />
      )}
    </div>
  )
}
