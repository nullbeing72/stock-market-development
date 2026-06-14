/**
 * FcmRiskPanel.jsx — Fuzzy C-Means Risk Analysis display
 *
 * Shows:
 *  - Current fuzzy risk score + label (High / Moderate / Low)
 *  - Year-wise FCM membership chart (bar chart)
 *  - Overall mean fuzzy membership
 *  - Cluster centre volatilities
 *  - Explanation card for the methodology
 */
import React from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

const axisStyle = { fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, fill: '#8c97a4' }
const gridStyle = { stroke: '#e2e6ea', strokeDasharray: '4 4' }

function riskColor(score) {
  if (score == null) return 'var(--text-dim)'
  if (score >= 0.65) return 'var(--red)'
  if (score >= 0.40) return 'var(--amber)'
  return 'var(--green)'
}

function barColor(score) {
  if (score == null) return '#445566'
  if (score >= 0.65) return '#f87171'
  if (score >= 0.40) return '#fbb03b'
  return '#4ade80'
}

export default function FcmRiskPanel({ fcmRisk }) {
  if (!fcmRisk) return null

  const {
    yearly         = {},
    overall_mean,
    current_score,
    risk_label     = 'Unavailable',
    cluster_centers = [],
    error          = '',
  } = fcmRisk

  const yearlyEntries = Object.entries(yearly)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, val]) => ({ year, score: val }))

  const hasData = yearlyEntries.length > 0

  return (
    <div className="chart-wrap" style={{ marginBottom: '0.75rem' }}>
      {/* Header row */}
      <div className="chart-title" style={{ marginBottom: '0.85rem' }}>
        <span>🎯 Fuzzy C-Means Risk Analysis</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-dim)' }}>
          High-risk / Low-risk fuzzy segregation · Year-wise membership means
        </span>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginBottom: '1rem' }}>
        {/* Current risk score */}
        <div className="metric-card" style={{ minWidth: 160, flex: '1 1 160px' }}>
          <div className="metric-label">Current Risk Score</div>
          <div className="metric-value" style={{ color: riskColor(current_score), fontSize: '1.8rem' }}>
            {current_score != null ? current_score.toFixed(3) : '—'}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.65rem', marginTop: '0.2rem',
            color: riskColor(current_score), fontWeight: 600,
          }}>
            {risk_label}
          </div>
        </div>

        {/* Overall mean */}
        <div className="metric-card" style={{ minWidth: 140, flex: '1 1 140px' }}>
          <div className="metric-label">Overall Mean (All Years)</div>
          <div className="metric-value" style={{ color: riskColor(overall_mean) }}>
            {overall_mean != null ? overall_mean.toFixed(3) : '—'}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
            Avg fuzzy membership
          </div>
        </div>

        {/* Cluster volatility centres */}
        {cluster_centers.length >= 2 && (
          <div className="metric-card" style={{ minWidth: 180, flex: '1 1 180px' }}>
            <div className="metric-label">FCM Cluster Centres (Ann. Vol %)</div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
              {cluster_centers.map((c, i) => (
                <div key={i} style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700,
                  padding: '2px 8px', borderRadius: '4px',
                  background: i === fcmRisk.high_risk_centre_idx
                    ? 'rgba(248,113,113,0.12)' : 'rgba(74,222,128,0.10)',
                  color: i === fcmRisk.high_risk_centre_idx ? 'var(--red)' : 'var(--green)',
                  border: `1px solid ${i === fcmRisk.high_risk_centre_idx ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.25)'}`,
                }}>
                  {i === fcmRisk.high_risk_centre_idx ? '⬆ High' : '⬇ Low'}: {c.toFixed(1)}%
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error detail — only shown when unavailable */}
      {risk_label === 'Unavailable' && error && (
        <div style={{
          marginBottom: '0.85rem', padding: '0.5rem 0.85rem',
          background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.25)',
          borderRadius: 'var(--r)', fontFamily: 'var(--font-mono)',
          fontSize: '0.6rem', color: 'var(--red)', lineHeight: 1.6,
        }}>
          ⚠ FCM error (check backend console for full traceback): {error}
        </div>
      )}

      {/* Year-wise bar chart */}
      {hasData && (
        <>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: '0.4rem', letterSpacing: '0.06em' }}>
            YEAR-WISE FUZZY HIGH-RISK MEMBERSHIP (0 = Low Risk · 1 = High Risk)
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={yearlyEntries} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridStyle} />
              <XAxis dataKey="year" tick={axisStyle} />
              <YAxis domain={[0, 1]} tick={axisStyle} width={38} tickFormatter={v => v.toFixed(1)} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e2e6ea', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#1a2332' }}
                formatter={(v, name) => [v.toFixed(4), 'Fuzzy Membership']}
                labelFormatter={label => `Year: ${label}`}
              />
              <ReferenceLine y={0.65} stroke="rgba(248,113,113,0.4)" strokeDasharray="4 2"
                label={{ value: 'High Risk', position: 'insideTopRight', style: { fontSize: 8, fill: 'rgba(248,113,113,0.6)', fontFamily: 'JetBrains Mono, monospace' } }}
              />
              <ReferenceLine y={0.40} stroke="rgba(251,176,59,0.35)" strokeDasharray="4 2"
                label={{ value: 'Moderate', position: 'insideTopRight', style: { fontSize: 8, fill: 'rgba(251,176,59,0.6)', fontFamily: 'JetBrains Mono, monospace' } }}
              />
              <Bar dataKey="score" name="Fuzzy Membership" radius={[3, 3, 0, 0]}>
                {yearlyEntries.map((entry, i) => (
                  <Cell key={i} fill={barColor(entry.score)} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Year-wise table */}
          <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Year</th><th>Mean Fuzzy Membership</th><th>Risk Level</th></tr>
              </thead>
              <tbody>
                {yearlyEntries.map(({ year, score }) => {
                  const label = score >= 0.65 ? 'High Risk' : score >= 0.40 ? 'Moderate Risk' : 'Low Risk'
                  return (
                    <tr key={year}>
                      <td style={{ color: 'var(--text-muted)' }}>{year}</td>
                      <td style={{ color: riskColor(score), fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                        {score.toFixed(4)}
                      </td>
                      <td style={{ color: riskColor(score) }}>{label}</td>
                    </tr>
                  )
                })}
                <tr style={{ borderTop: '2px solid var(--border-bright)' }}>
                  <td style={{ color: 'var(--text-bright)', fontWeight: 600 }}>Overall Mean</td>
                  <td style={{ color: riskColor(overall_mean), fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    {overall_mean != null ? overall_mean.toFixed(4) : '—'}
                  </td>
                  <td style={{ color: riskColor(overall_mean), fontWeight: 600 }}>
                    {overall_mean != null
                      ? overall_mean >= 0.65 ? 'High Risk'
                      : overall_mean >= 0.40 ? 'Moderate Risk'
                      : 'Low Risk'
                      : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Methodology note */}
      <div style={{
        marginTop: '0.85rem',
        background: 'rgba(251,176,59,0.05)',
        border: '1px solid var(--border-accent)',
        borderRadius: 'var(--r)',
        padding: '0.65rem 0.9rem',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.6rem',
        color: 'var(--text-dim)',
        lineHeight: 1.7,
      }}>
        <strong style={{ color: 'var(--amber)' }}>Methodology:</strong>{' '}
        Fuzzy C-Means (FCM, c=2, m=2) clusters each trading day by 3 risk features —
        21-day annualised volatility, 60-day rolling beta, and 60-day max drawdown.
        Unlike k-means, FCM assigns every day a soft membership degree [0, 1] in the
        high-risk cluster. Daily values are averaged within each calendar year to produce
        year-wise fuzzy risk values; the professor&apos;s requested overall mean is the
        mean of those yearly averages.
      </div>
    </div>
  )
}
