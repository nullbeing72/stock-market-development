/**
 * App.jsx — Ticker-Teller v1.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import Sidebar from './components/Sidebar.jsx'
import TrainingProgress from './components/TrainingProgress.jsx'
import MetricCards from './components/MetricCards.jsx'
import PriceChart from './components/PriceChart.jsx'
import { LossChart, MacdChart } from './components/LossAndMacdCharts.jsx'
import CommodityPanel from './components/CommodityPanel.jsx'
import GdpPanel from './components/GdpPanel.jsx'
import BondPanel from './components/BondPanel.jsx'
import { CorrelationPanel, AboutModal } from './components/CorrelationAndAbout.jsx'
import FcmRiskPanel from './components/FcmRiskPanel.jsx'
import { streamAnalyze } from './api.js'

// ── Shared logo ───────────────────────────────────────────────────────────────
// FIX: was duplicated identically in App.jsx and Sidebar.jsx
export function TickerLogo({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none"
      xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <rect width="38" height="38" rx="8" fill="rgba(251,176,59,0.1)" stroke="rgba(251,176,59,0.35)" strokeWidth="1"/>
      <rect x="8"  y="22" width="4" height="8"  rx="1" fill="#f87171" opacity="0.9"/>
      <line x1="10" y1="20" x2="10" y2="22" stroke="#f87171" strokeWidth="1.5" opacity="0.9"/>
      <line x1="10" y1="30" x2="10" y2="32" stroke="#f87171" strokeWidth="1.5" opacity="0.9"/>
      <rect x="17" y="14" width="4" height="10" rx="1" fill="#4ade80" opacity="0.9"/>
      <line x1="19" y1="11" x2="19" y2="14" stroke="#4ade80" strokeWidth="1.5" opacity="0.9"/>
      <line x1="19" y1="24" x2="19" y2="27" stroke="#4ade80" strokeWidth="1.5" opacity="0.9"/>
      <rect x="26" y="10" width="4" height="12" rx="1" fill="#4ade80" opacity="0.9"/>
      <line x1="28" y1="7"  x2="28" y2="10" stroke="#4ade80" strokeWidth="1.5" opacity="0.9"/>
      <line x1="28" y1="22" x2="28" y2="25" stroke="#4ade80" strokeWidth="1.5" opacity="0.9"/>
      <polyline points="7,28 14,20 21,23 31,10" stroke="#fbb03b" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.85"/>
    </svg>
  )
}

const DEFAULT_CONFIG = {
  ticker:        'AAPL',
  period:        730,
  seq_length:    60,
  forecast_days: 5,
  epochs:        50,
  patience:      10,
  hidden_size:   128,
  cnn_channels:  64,
  num_heads:     4,
  dropout:       0.2,
}

const TABS = [
  { id: 'price', label: 'Price Chart' },
  { id: 'model', label: 'Model Performance' },
  { id: 'macd',  label: 'MACD' },
]

const NAV_ITEMS = [
  { id: 'commodities',  label: 'Commodities',  icon: '🪙' },
  { id: 'gdp',          label: 'GDP Growth',    icon: '🌍' },
  { id: 'bonds',        label: 'Bond Yields',   icon: '📉' },
  { id: 'correlations', label: 'Correlations',  icon: '🔗' },
]

export default function App() {
  const [config,      setConfig]      = useState(DEFAULT_CONFIG)
  const [running,     setRunning]     = useState(false)
  const [result,      setResult]      = useState(null)
  const [error,       setError]       = useState(null)
  const [statusMsgs,  setStatusMsgs]  = useState([])
  const [epochInfo,   setEpochInfo]   = useState(null)
  const [lossHistory, setLossHistory] = useState([])
  const [activeTab,   setActiveTab]   = useState('price')
  const [navView,     setNavView]     = useState(null)
  const [hamOpen,     setHamOpen]     = useState(false)
  const [showAbout,   setShowAbout]   = useState(false)

  const cancelRef  = useRef(null)
  const runGenRef  = useRef(0)
  const hamMenuRef = useRef(null)
  const hamBtnRef  = useRef(null)

  // Close hamburger on outside click
  useEffect(() => {
    if (!hamOpen) return
    const handler = e => {
      if (hamMenuRef.current?.contains(e.target) || hamBtnRef.current?.contains(e.target)) return
      setHamOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [hamOpen])

  // Cancel stream on unmount
  useEffect(() => () => cancelRef.current?.(), [])

  const handleRun = useCallback(() => {
    if (cancelRef.current) cancelRef.current()
    const gen = ++runGenRef.current

    setRunning(true)
    setError(null)
    setResult(null)
    setStatusMsgs([])
    setEpochInfo(null)
    setLossHistory([])
    setNavView(null)
    setHamOpen(false)
    setActiveTab('price')

    cancelRef.current = streamAnalyze(config, event => {
      if (runGenRef.current !== gen) return
      switch (event.type) {
        case 'status':
          setStatusMsgs(prev => [...prev, event.message])
          break
        case 'epoch':
          setEpochInfo(event)
          setLossHistory(prev => [...prev, event.val_loss])
          break
        case 'result':
          setResult(event)
          setRunning(false)
          setEpochInfo(null)
          break
        case 'error':
          setError(event.message)
          setRunning(false)
          setEpochInfo(null)
          break
      }
    })
  }, [config])

  const handleNavSelect = id => {
    setNavView(prev => prev === id ? null : id)
    setHamOpen(false)
  }

  const currency = result?.currency ?? '$'
  const ticker   = result?.ticker   ?? config.ticker

  return (
    <div className="app-shell">
      <Sidebar config={config} onChange={setConfig} onRun={handleRun} running={running} />

      {/* ── Fixed global hamburger ── */}
      <div className="global-ham-container">
        <button
          ref={hamBtnRef}
          className={`global-ham-btn ${hamOpen ? 'open' : ''}`}
          onClick={() => setHamOpen(o => !o)}
          title="More Analysis panels"
        >
          <span className="global-ham-icon">{hamOpen ? '✕' : '☰'}</span>
          <span>More Analysis</span>
        </button>

        {hamOpen && (
          <div ref={hamMenuRef} className="global-ham-menu">
            <div className="global-ham-label">Extended Analysis</div>
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                className={`global-ham-item ${navView === item.id ? 'active' : ''}`}
                onClick={() => handleNavSelect(item.id)}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
                {navView === item.id && <span style={{ marginLeft: 'auto', fontSize: '0.55rem' }}>✓</span>}
              </button>
            ))}
            {navView && (
              <>
                <hr className="ham-divider" />
                <button
                  className="global-ham-item"
                  style={{ color: 'var(--text-dim)' }}
                  onClick={() => { setNavView(null); setHamOpen(false) }}
                >
                  ← Back to Analysis
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Main content ── */}
      <div className="main-content">
        {/* Header — always visible */}
        <div className="tt-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <TickerLogo />
            <div>
              <div className="tt-title">Ticker<span>-</span>Teller</div>
              <div className="tt-subtitle">
                CNN → BiLSTM → Attention &nbsp;·&nbsp; Monte Carlo Forecast &nbsp;·&nbsp; FCM Risk &nbsp;·&nbsp; 31 Features
              </div>
              {result && (
                <div className="tt-status-bar">
                  <span className="dot-live" />
                  <span>{ticker}</span>
                  <span style={{ color: 'var(--border-bright)' }}>·</span>
                  <span>{result.features?.total ?? 31} features</span>
                  <span style={{ color: 'var(--border-bright)' }}>·</span>
                  <span style={{ color: result.device === 'cuda' ? 'var(--green)' : 'var(--text-dim)' }}>
                    {result.device?.toUpperCase() ?? 'CPU'}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="tt-meta">
            FastAPI + React/Vite<br />
            <span className="tt-meta-version">v1.0</span>
          </div>
        </div>

        {/* ── Navigation panel view (replaces analysis) ── */}
        {navView ? (
          <div className="nav-view-container">
            <div className="nav-view-header">
              <div className="section-header" style={{ margin: 0 }}>
                {NAV_ITEMS.find(i => i.id === navView)?.icon}&nbsp;
                {NAV_ITEMS.find(i => i.id === navView)?.label}
              </div>
              <button className="close-panel-btn" onClick={() => setNavView(null)}>
                ← Back to Analysis
              </button>
            </div>

            {navView === 'commodities' && (
              <CommodityPanel period={config.period} forecastDays={config.forecast_days} />
            )}
            {navView === 'gdp' && (
              <GdpPanel period={config.period} forecastDays={30} />
            )}
            {navView === 'bonds' && (
              <BondPanel period={config.period} />
            )}
            {navView === 'correlations' && result && (
              <CorrelationPanel correlations={result.charts?.correlations} />
            )}
            {/* FIX: Clear explanation when correlations panel is opened before running */}
            {navView === 'correlations' && !result && (
              <div className="status-msg" style={{ marginTop: '1rem' }}>
                <span className="status-dot" style={{ background: 'var(--amber)' }} />
                Feature correlations are computed during stock analysis. Enter a ticker in the
                sidebar and press <strong style={{ color: 'var(--amber)' }}>Run</strong> to populate this panel.
              </div>
            )}
          </div>
        ) : (
          /* ── Analysis view ── */
          <>
            {/* Training progress */}
            {(running || statusMsgs.length > 0) && !result && !error && (
              <TrainingProgress
                status={running}
                epochInfo={epochInfo}
                totalEpochs={config.epochs}
                statusMessages={statusMsgs}
                lossHistory={lossHistory}
              />
            )}

            {/* Error */}
            {error && <div className="error-msg">⚠ {error}</div>}

            {/* Results */}
            {result ? (
              <>
                <MetricCards
                  summary={result.summary}
                  metrics={result.metrics}
                  currency={currency}
                  forecastDays={config.forecast_days}
                />

                {/* Signal + data-split pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div className="signal-row">
                    <span className="signal-label">AI Signal</span>
                    <span className={`badge badge-${result.summary?.badge ?? 'neutral'}`}>
                      {result.summary?.signal ?? '—'}
                    </span>
                  </div>
                  <div className="split-pills">
                    <span className="pill pill-train">Train {result.splits?.n_train?.toLocaleString() ?? '—'}</span>
                    <span className="pill pill-val">Val {result.splits?.n_val?.toLocaleString() ?? '—'}</span>
                    <span className="pill pill-test">Test {result.splits?.n_test?.toLocaleString() ?? '—'}</span>
                  </div>
                </div>

                {/* Model architecture expander */}
                <ModelExpander model={result.model} metrics={result.metrics} currency={currency} />

                {/* Tabs */}
                <div className="tabs">
                  {TABS.map(t => (
                    <button
                      key={t.id}
                      className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
                      onClick={() => setActiveTab(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                {activeTab === 'price' && (
                  <PriceChart charts={result.charts} currency={currency} />
                )}
                {activeTab === 'model' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* FCM Risk panel — sits at the top of Model Performance */}
                    <FcmRiskPanel fcmRisk={result.fcm_risk} />
                    <LossChart lossData={result.charts?.loss} />
                    <TestMetricsTable metrics={result.metrics} currency={currency} />
                  </div>
                )}
                {activeTab === 'macd' && (
                  <MacdChart charts={result.charts} />
                )}

                {/* Footer */}
                <div className="footer">
                  <span>
                    Ticker-Teller v3.3 &nbsp;·&nbsp; {ticker} &nbsp;·&nbsp;
                    {result.features?.total ?? 31} features ({result.features?.price ?? 17}p + {result.features?.macro ?? 14}m) &nbsp;·&nbsp;
                    {result.device?.toUpperCase() ?? 'CPU'}
                  </span>
                  <button className="about-link" onClick={() => setShowAbout(true)}>ℹ About</button>
                </div>
              </>
            ) : !running && !error && (
              <LandingView onAbout={() => setShowAbout(true)} />
            )}
          </>
        )}
      </div>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  )
}

// ── Landing view ──────────────────────────────────────────────────────────────
function LandingView({ onAbout }) {
  const features = [
    { icon: '🧠', text: 'CNN → BiLSTM → Multi-Head Attention hybrid architecture' },
    { icon: '📊', text: '31 features — OHLCV, 12 technical indicators, 14 macro factors' },
    { icon: '🎯', text: 'Fuzzy C-Means risk segregation — year-wise high/low risk membership' },
    { icon: '🎲', text: 'Monte Carlo Dropout for calibrated uncertainty bands' },
    { icon: '📡', text: 'Live training progress streamed via Server-Sent Events' },
    { icon: '🌍', text: 'Bond yields, commodity forecasts & GDP proxies — via ☰ More Analysis' },
  ]
  const tickers = ['AAPL', 'TSLA', 'MSFT', 'NVDA', 'RELIANCE.NS', 'BTC-USD']

  return (
    <div className="landing-box">
      <div style={{
        fontFamily: 'var(--font-display)', fontWeight: 700,
        fontSize: '2.2rem', color: 'var(--text-bright)',
        marginBottom: '0.4rem', lineHeight: 1, letterSpacing: '-0.02em',
      }}>
        Ready to analyse.
      </div>
      <p style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.74rem',
        color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: '1.4rem',
      }}>
        Enter a ticker symbol in the sidebar and press <strong style={{ color: 'var(--amber)' }}>Run</strong> to begin.
        Use <strong style={{ color: 'var(--amber)' }}>☰ More Analysis</strong> (top-right) to explore
        global commodities, GDP proxies, bond yields, and macro correlations.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '1.4rem' }}>
        {features.map(f => (
          <div key={f.text} style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.7rem',
            fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
            color: 'var(--text-muted)', lineHeight: 1.6,
          }}>
            <span style={{ fontSize: '0.85rem', flexShrink: 0, marginTop: '0.05rem' }}>{f.icon}</span>
            <span>{f.text}</span>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
          color: 'var(--text-dim)', letterSpacing: '0.12em',
          textTransform: 'uppercase', marginBottom: '0.5rem',
        }}>
          Quick start
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {tickers.map(sym => (
            <span key={sym} style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.66rem',
              padding: '3px 10px', borderRadius: '3px',
              background: 'var(--amber-subtle)',
              border: '1px solid var(--border-accent)',
              color: 'var(--amber)', letterSpacing: '0.06em', cursor: 'default',
            }}>
              {sym}
            </span>
          ))}
        </div>
      </div>
      <button className="about-link" onClick={onAbout} style={{ fontSize: '0.68rem' }}>
        ℹ Architecture, methodology &amp; disclaimer
      </button>
    </div>
  )
}

// ── Model expander ────────────────────────────────────────────────────────────
function ModelExpander({ model, metrics, currency }) {
  const [open, setOpen] = useState(false)
  if (!model) return null
  const items = [
    { label: 'Total Parameters',  value: model.total_params?.toLocaleString()     ?? '—' },
    { label: 'Trainable Params',  value: model.trainable_params?.toLocaleString() ?? '—' },
    { label: 'RMSE (Test Set)',   value: metrics?.rmse != null ? `${currency}${metrics.rmse.toFixed(4)}` : '—' },
    { label: 'MAPE (Test Set)',   value: metrics?.mape != null ? `${metrics.mape.toFixed(2)}%`           : '—' },
  ]
  return (
    <div className="expander">
      <div className="expander-header" onClick={() => setOpen(o => !o)}>
        <span>Model Architecture &amp; Extended Metrics</span>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.62rem', fontFamily: 'var(--font-mono)' }}>
          {model.total_params?.toLocaleString()} params &nbsp;{open ? '▲' : '▼'}
        </span>
      </div>
      {open && (
        <div className="expander-body">
          {items.map(({ label, value }) => (
            <div key={label} className="metric-card" style={{ minWidth: 140, flex: '1 1 140px' }}>
              <div className="metric-label">{label}</div>
              <div className="metric-value" style={{ fontSize: '1.1rem' }}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Test metrics table ────────────────────────────────────────────────────────
function TestMetricsTable({ metrics, currency }) {
  if (!metrics) return null
  const rows = [
    { label: 'MAE — Mean Absolute Error',      value: metrics.mae  != null ? `${currency}${metrics.mae.toFixed(4)}`  : '—' },
    { label: 'RMSE — Root Mean Squared Error', value: metrics.rmse != null ? `${currency}${metrics.rmse.toFixed(4)}` : '—' },
    { label: 'MAPE — Mean Abs. % Error',       value: metrics.mape != null ? `${metrics.mape.toFixed(2)}%`           : '—' },
    { label: 'Directional Accuracy',           value: metrics.directional_accuracy != null ? `${metrics.directional_accuracy.toFixed(1)}%` : '—' },
  ]
  return (
    <div className="chart-wrap">
      <div className="chart-title">Test Set Metrics</div>
      <table className="data-table">
        <thead><tr><th>Metric</th><th>Value</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label}>
              <td style={{ color: 'var(--text-muted)' }}>{r.label}</td>
              <td style={{ color: 'var(--amber)', fontWeight: 600 }}>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
