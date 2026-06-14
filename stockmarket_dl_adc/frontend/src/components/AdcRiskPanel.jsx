/**
 * AdcRiskPanel.jsx — Autoencoder Deep Clustering Risk Analysis display
 *
 * Replaces FcmRiskPanel.jsx (v1.1 FCM).
 *
 * Shows:
 *  - Current ADC risk score + label (High / Moderate / Low)
 *  - Year-wise high-risk soft membership bar chart
 *  - Overall mean membership across all years
 *  - Per-cluster annualised volatility centres (4 clusters)
 *  - Latent dimension used by the autoencoder
 *  - Methodology explanation card
 *
 * Consumes result.adc_risk with schema:
 *  {
 *    yearly:               { "2018": 0.312, … },
 *    overall_mean:         0.41,
 *    current_score:        0.72,
 *    risk_label:           "High Risk" | "Moderate Risk" | "Low Risk" | "Unavailable",
 *    cluster_centers:      [12.3, 28.7, 44.1, 61.5],   // ann. vol % per cluster
 *    high_risk_centre_idx: 3,
 *    n_clusters:           4,
 *    latent_dim:           10,
 *    error:                "",
 *  }
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
  if (score >= 0.65)  return 'var(--red)'
  if (score >= 0.40)  return 'var(--amber)'
  return 'var(--green)'
}

function barColor(score) {
  if (score == null) return '#445566'
  if (score >= 0.65)  return '#f87171'
  if (score >= 0.40)  return '#fbb03b'
  return '#4ade80'
}

const CLUSTER_PALETTE = [
  { bg: 'rgba(74,222,128,0.10)',  border: 'rgba(74,222,128,0.25)',  text: 'var(--green)' },
  { bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.25)',  text: '#60a5fa'      },
  { bg: 'rgba(251,176,59,0.10)',  border: 'rgba(251,176,59,0.30)',  text: 'var(--amber)' },
  { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.30)', text: 'var(--red)'   },
]

export default function AdcRiskPanel({ adcRisk }) {
  if (!adcRisk) return null

  const {
    yearly               = {},
    overall_mean,
    current_score,
    risk_label           = 'Unavailable',
    cluster_centers      = [],
    high_risk_centre_idx = 0,
    n_clusters           = 4,
    latent_dim           = 10,
    error                = '',
  } = adcRisk

  const yearlyEntries = Object.entries(yearly)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, val]) => ({ year, score: val }))

  const hasData = yearlyEntries.length > 0

  // Sort cluster centres low→high so the label ordering is clear
  const sortedCenters = cluster_centers
    .map((vol, i) => ({ vol, i, isHigh: i === high_risk_centre_idx }))
    .sort((a, b) => a.vol - b.vol)

  return (
    <div className="chart-wrap" style={{ marginBottom: '0.75rem' }}>

      {/* ── Header ── */}
      <div className="chart-title" style={{ marginBottom: '0.85rem' }}>
        <span>🤖 Autoencoder Deep Clustering Risk Analysis</span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-dim)',
        }}>
          IDEC · {n_clusters} clusters · latent dim {latent_dim} · year-wise high-risk membership
        </span>
      </div>

      {/* ── Summary cards ── */}
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
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-dim)', marginTop: '0.2rem',
          }}>
            Avg high-risk membership
          </div>
        </div>

        {/* Cluster volatility centres */}
        {sortedCenters.length > 0 && (
          <div className="metric-card" style={{ minWidth: 210, flex: '1 1 210px' }}>
            <div className="metric-label">ADC Cluster Centres (Ann. Vol %)</div>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
              {sortedCenters.map(({ vol, i, isHigh }, rank) => {
                const pal = CLUSTER_PALETTE[Math.min(rank, CLUSTER_PALETTE.length - 1)]
                return (
                  <div key={i} style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700,
                    padding: '2px 8px', borderRadius: '4px',
                    background: pal.bg,
                    color:      pal.text,
                    border:     `1px solid ${pal.border}`,
                    whiteSpace: 'nowrap',
                  }}>
                    {isHigh ? '⬆ High' : `C${rank + 1}`}: {vol.toFixed(1)}%
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Error detail ── */}
      {risk_label === 'Unavailable' && error && (
        <div style={{
          marginBottom: '0.85rem', padding: '0.5rem 0.85rem',
          background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.25)',
          borderRadius: 'var(--r)', fontFamily: 'var(--font-mono)',
          fontSize: '0.6rem', color: 'var(--red)', lineHeight: 1.6,
        }}>
          ⚠ ADC error (check backend console for full traceback): {error}
        </div>
      )}

      {/* ── Year-wise bar chart ── */}
      {hasData && (
        <>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)',
            marginBottom: '0.4rem', letterSpacing: '0.06em',
          }}>
            YEAR-WISE HIGH-RISK CLUSTER MEMBERSHIP (0 = Low Risk · 1 = High Risk)
          </div>

          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={yearlyEntries} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridStyle} />
              <XAxis dataKey="year" tick={axisStyle} />
              <YAxis domain={[0, 1]} tick={axisStyle} width={38} tickFormatter={v => v.toFixed(1)} />
              <Tooltip
                contentStyle={{
                  background: '#ffffff', border: '1px solid #e2e6ea', borderRadius: 6,
                  fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#1a2332',
                }}
                formatter={(v) => [v.toFixed(4), 'High-Risk Membership']}
                labelFormatter={label => `Year: ${label}`}
              />
              <ReferenceLine y={0.65} stroke="rgba(248,113,113,0.4)" strokeDasharray="4 2"
                label={{
                  value: 'High Risk', position: 'insideTopRight',
                  style: { fontSize: 8, fill: 'rgba(248,113,113,0.6)', fontFamily: 'JetBrains Mono, monospace' },
                }}
              />
              <ReferenceLine y={0.40} stroke="rgba(251,176,59,0.35)" strokeDasharray="4 2"
                label={{
                  value: 'Moderate', position: 'insideTopRight',
                  style: { fontSize: 8, fill: 'rgba(251,176,59,0.6)', fontFamily: 'JetBrains Mono, monospace' },
                }}
              />
              <Bar dataKey="score" name="High-Risk Membership" radius={[3, 3, 0, 0]}>
                {yearlyEntries.map((entry, idx) => (
                  <Cell key={idx} fill={barColor(entry.score)} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Year-wise table */}
          <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Mean High-Risk Membership</th>
                  <th>Risk Level</th>
                </tr>
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

      {/* ── Methodology note ── */}
      <div style={{
        marginTop: '0.85rem',
        background: 'rgba(96,165,250,0.05)',
        border: '1px solid rgba(96,165,250,0.2)',
        borderRadius: 'var(--r)',
        padding: '0.65rem 0.9rem',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.6rem',
        color: 'var(--text-dim)',
        lineHeight: 1.7,
      }}>
        <strong style={{ color: '#60a5fa' }}>Methodology:</strong>{' '}
        Improved Deep Embedded Clustering (IDEC) on all 31 engineered features.{' '}
        <strong>Phase 1</strong> — Autoencoder pre-training (Encoder: d→256→128→64→{latent_dim},
        mirrored Decoder) with MSE reconstruction loss.{' '}
        <strong>Phase 2</strong> — k-Means initialisation of {n_clusters} cluster centres in
        the {latent_dim}-dimensional latent space.{' '}
        <strong>Phase 3</strong> — Joint optimisation:{' '}
        L = λ·L&#x5F;rec + (1−λ)·KL(P‖Q), where Q is the Student-t soft assignment
        and P is the sharpened target distribution (high-confidence assignments
        are strengthened). The high-risk cluster is identified by the highest mean
        21-day annualised volatility. Each day&apos;s risk score is its soft
        membership probability Q in that cluster.
      </div>
    </div>
  )
}
