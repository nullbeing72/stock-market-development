import React, { useMemo } from 'react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

export default function TrainingProgress({ status, epochInfo, totalEpochs, statusMessages, lossHistory = [] }) {
  const pct = epochInfo ? Math.round((epochInfo.epoch / totalEpochs) * 100) : 0

  const sparkData = useMemo(() =>
    lossHistory.slice(-50).map((v, i) => ({ i, v }))
  , [lossHistory])

  return (
    <div className="training-box">
      {/* Status log */}
      <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {statusMessages.slice(-3).map((msg, i, arr) => (
          <div
            key={i}
            className="status-msg"
            style={{ opacity: i < arr.length - 1 ? 0.45 : 1 }}
          >
            {i === arr.length - 1 && <span className="status-dot" />}
            {msg}
          </div>
        ))}
      </div>

      {epochInfo && (
        <>
          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
            <div className="progress-bar-wrap" style={{ flex: 1 }}>
              <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
              color: 'var(--amber)', minWidth: '2.6rem', textAlign: 'right', fontWeight: 500,
            }}>
              {pct}%
            </span>
          </div>

          {/* Epoch stats */}
          <div className="epoch-stats">
            <div>
              <div className="epoch-stat-label">EPOCH</div>
              <div className="epoch-stat-train">
                {epochInfo.epoch}
                <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> / {totalEpochs}</span>
              </div>
            </div>
            <div>
              <div className="epoch-stat-label">TRAIN LOSS</div>
              <div className="epoch-stat-train">{epochInfo.train_loss.toFixed(6)}</div>
            </div>
            <div>
              <div className="epoch-stat-label">VAL LOSS</div>
              <div className="epoch-stat-val">{epochInfo.val_loss.toFixed(6)}</div>
            </div>
            <div>
              <div className="epoch-stat-label">LR</div>
              <div className="epoch-stat-lr">{epochInfo.lr.toExponential(2)}</div>
            </div>

            {/* FIX: sparkline now labeled so users know it shows val loss */}
            {sparkData.length > 4 && (
              <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
                  VAL LOSS ↓
                </span>
                <div style={{ width: 80, height: 28, opacity: 0.65 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparkData}>
                      <Line
                        dataKey="v" stroke="var(--amber)" dot={false}
                        strokeWidth={1.5} isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
