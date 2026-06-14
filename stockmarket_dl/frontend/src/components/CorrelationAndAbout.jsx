import React from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const axisStyle = { fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, fill: '#8c97a4' }
const gridStyle = { stroke: '#e2e6ea', strokeDasharray: '4 4' }

function corrColor(v) {
  if (v >  0.5) return 'var(--green)'
  if (v >  0.1) return '#4ade80aa'
  if (v < -0.5) return 'var(--red)'
  if (v < -0.1) return '#f87171aa'
  return '#445566'
}

function strengthLabel(abs) {
  if (abs > 0.7) return 'Very strong'
  if (abs > 0.5) return 'Strong'
  if (abs > 0.3) return 'Moderate'
  if (abs > 0.1) return 'Weak'
  return 'Negligible'
}

export function CorrelationPanel({ correlations }) {
  if (!correlations?.length) return (
    <div className="status-msg">Correlation data not available.</div>
  )
  const sorted = [...correlations].sort((a, b) => b.correlation - a.correlation)
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
        Pearson correlation between close price and each macro/technical feature
      </div>
      <div className="chart-wrap" style={{ marginBottom: '0.75rem' }}>
        <div className="chart-title">
          <span>Feature Correlations with Close Price</span>
          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.58rem' }}>
            <span style={{ color: 'var(--green)' }}>▌ Positive</span>
            <span style={{ color: 'var(--red)' }}>▌ Negative</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={Math.max(240, sorted.length * 24)}>
          <BarChart data={sorted} layout="vertical" margin={{ top: 5, right: 40, left: 90, bottom: 0 }}>
            <CartesianGrid {...gridStyle} horizontal={false} />
            <XAxis type="number" domain={[-1, 1]} tick={axisStyle} tickFormatter={v => v.toFixed(1)} />
            <YAxis type="category" dataKey="feature" tick={axisStyle} width={85} />
            <Tooltip
              contentStyle={{ background: '#ffffff', border: '1px solid #e2e6ea', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.65rem', color: '#1a2332' }}
              formatter={v => [v.toFixed(4), 'Correlation']}
            />
            <ReferenceLine x={0} stroke="rgba(255,255,255,0.06)" />
            <Bar dataKey="correlation" name="Correlation" isAnimationActive animationDuration={500}>
              {sorted.map((entry, i) => (
                <Cell key={i} fill={corrColor(entry.correlation)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-wrap" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr><th>Feature</th><th>Correlation</th><th>Strength</th><th>Direction</th></tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const v = r.correlation
              return (
                <tr key={r.feature}>
                  <td>{r.feature}</td>
                  <td style={{ color: corrColor(v), fontWeight: 500 }}>{v >= 0 ? '+' : ''}{v.toFixed(4)}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{strengthLabel(Math.abs(v))}</td>
                  <td style={{ color: 'var(--text-dim)' }}>{Math.abs(v) <= 0.1 ? 'Neutral' : v > 0 ? 'Positive' : 'Negative'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function AboutModal({ onClose }) {
  const handleOverlay = e => { if (e.target === e.currentTarget) onClose() }
  return (
    <div className="modal-overlay" onClick={handleOverlay}>
      <div className="modal-box">
        <button className="modal-close" onClick={onClose}>✕ Close</button>
        <div className="modal-title">About Ticker-Teller v1.0</div>
        <div className="modal-body">
          <p>
            A full-stack stock forecasting system: <strong>FastAPI</strong> Python backend +{' '}
            <strong>React / Vite</strong> frontend, streaming live training progress via{' '}
            <strong>Server-Sent Events (SSE)</strong>.
          </p>

          <div className="modal-section">What it does</div>
          <ul>
            {[
              ['📊', '31 input features', '— OHLCV + RSI, MACD, BB, RVI, ATR + Beta, Sharpe, Buffett Proxy, 5Y/10Y bonds, Gold, Silver, Copper, Aluminium, Brent Oil'],
              ['🧠', 'Hybrid deep model', '— CNN → BiLSTM → Multi-Head Attention + MC-Dropout uncertainty'],
              ['🎯', 'Fuzzy C-Means risk', '— Year-wise FCM risk segregation (high/low) with mean fuzzy membership score'],
              ['📦', 'Commodity forecasts', '— Holt-Winters double exponential smoothing per commodity'],
              ['🌍', 'GDP proxies', '— country ETF momentum + Holt smoothing for 7 economies'],
              ['📉', 'Bond yield curve', '— 5Y and 10Y US Treasuries with spread & inversion analysis'],
              ['🔗', 'Macro correlations', '— feature-by-feature Pearson correlation table'],
              ['⚡', 'Live streaming', '— real-time epoch progress via SSE; no polling'],
            ].map(([icon, label, desc]) => (
              <li key={label}>
                {icon} <strong>{label}</strong> {desc}
              </li>
            ))}
          </ul>

          <div className="modal-section">Fuzzy C-Means Risk Analysis</div>
          <ul>
            <li><strong>Features:</strong> 21-day annualised volatility, 60-day rolling beta, 60-day max drawdown magnitude.</li>
            <li><strong>Algorithm:</strong> FCM with c=2 clusters (high-risk / low-risk), fuzzifier m=2, producing soft membership degrees [0, 1].</li>
            <li><strong>Year-wise values:</strong> Daily fuzzy membership scores are grouped by calendar year and averaged — capturing how the stock's risk regime evolved year over year.</li>
            <li><strong>Overall mean:</strong> The mean of all yearly averages gives a single holistic risk score for the entire history.</li>
          </ul>

          <div className="modal-section">Model Architecture</div>
          <ul>
            <li><strong>Temporal Conv Block</strong> — dual-kernel (3 & 5) 1-D CNN with residual projection.</li>
            <li><strong>Bidirectional LSTM</strong> — captures long-range sequential dependencies in both directions.</li>
            <li><strong>Multi-Head Self-Attention</strong> — scores which timesteps matter most; residual + LayerNorm.</li>
            <li><strong>MC Dropout</strong> — 80-sample Monte Carlo passes produce calibrated ±1σ confidence bands.</li>
          </ul>

          <div className="modal-section">Loss Function</div>
          <ul>
            <li><strong>Huber loss</strong> — robust to extreme daily moves (δ = 0.01).</li>
            <li><strong>Directional penalty</strong> — relu(−sign(pred)·sign(target)) penalises wrong-sign predictions.</li>
            <li>Combined: <strong>L = Huber + 0.4 × DirectionalPenalty</strong></li>
          </ul>

          <div className="modal-section">Training</div>
          <ul>
            <li><strong>AdamW</strong> — decoupled weight decay for improved generalisation.</li>
            <li><strong>Cosine Annealing Warm Restarts</strong> — periodic LR resets to escape local minima.</li>
            <li><strong>Gradient Clipping</strong> — max norm 1.0 prevents exploding gradients.</li>
            <li><strong>Early Stopping</strong> — restores best-val-loss weights automatically.</li>
          </ul>

          <div className="modal-disclaimer">
            ⚠ <strong>Disclaimer:</strong> For educational and research purposes only. All forecasts carry
            inherent uncertainty and model risk. Do not use as the sole basis for financial decisions.
          </div>
        </div>
      </div>
    </div>
  )
}
