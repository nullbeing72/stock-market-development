import React from 'react'

function MetricCard({ label, value, delta, deltaClass, accent, icon }) {
  return (
    <div className="metric-card">
      <div className="metric-label">
        {icon && <span style={{ marginRight: '0.3rem' }}>{icon}</span>}
        {label}
      </div>
      <div className="metric-value" style={accent ? { color: accent } : undefined}>
        {value ?? '—'}
      </div>
      {delta != null && (
        <div className={`metric-delta ${deltaClass}`}>
          {deltaClass === 'delta-pos' ? '▲ ' : '▼ '}{delta}
        </div>
      )}
    </div>
  )
}

export default function MetricCards({ summary, metrics, currency, forecastDays }) {
  const pct    = summary?.pct_change ?? 0
  const dirAcc = metrics?.directional_accuracy
  const mae    = metrics?.mae

  const dirAccent = dirAcc == null ? undefined
    : dirAcc >= 60 ? 'var(--green)'
    : dirAcc >= 50 ? 'var(--amber)'
    : 'var(--red)'

  return (
    <div className="metric-grid">
      <MetricCard
        label="Current Price"
        icon="◎"
        value={summary
          ? `${currency}${summary.last_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : null}
      />
      <MetricCard
        label={`Forecast +${forecastDays}d`}
        icon="◈"
        accent={pct >= 0 ? 'var(--green)' : 'var(--red)'}
        value={summary
          ? `${currency}${summary.next_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : null}
        delta={summary ? `${Math.abs(pct).toFixed(2)}%` : null}
        deltaClass={pct >= 0 ? 'delta-pos' : 'delta-neg'}
      />
      <MetricCard
        label="Directional Acc."
        icon="◐"
        accent={dirAccent}
        value={dirAcc != null ? `${dirAcc.toFixed(1)}%` : null}
      />
      <MetricCard
        label="MAE (Test)"
        icon="◑"
        value={mae != null ? `${currency}${mae.toFixed(2)}` : null}
      />
      <MetricCard
        label="Ann. Volatility"
        icon="◒"
        accent={
          summary?.volatility > 0.4 ? 'var(--red)'
          : summary?.volatility > 0.2 ? 'var(--amber)'
          : 'var(--green)'
        }
        value={summary ? `${(summary.volatility * 100).toFixed(1)}%` : null}
      />
    </div>
  )
}
