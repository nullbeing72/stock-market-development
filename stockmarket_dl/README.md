# 📈 Ticker-Teller v1.0

> **Neural Market Intelligence** — A full-stack stock forecasting system powered by a hybrid deep-learning model, real-time SSE streaming, Fuzzy C-Means risk analysis, and comprehensive macro-economic overlays.

---

## Table of Contents

1. [Overview](#overview)
2. [Live Demo Preview](#live-demo-preview)
3. [Feature Highlights](#feature-highlights)
4. [System Architecture](#system-architecture)
5. [Model Architecture](#model-architecture)
6. [Input Feature Engineering](#input-feature-engineering)
7. [Loss Function](#loss-function)
8. [Training Pipeline](#training-pipeline)
9. [Monte Carlo Uncertainty Estimation](#monte-carlo-uncertainty-estimation)
10. [Fuzzy C-Means Risk Analysis](#fuzzy-c-means-risk-analysis)
11. [Macro-Economic Panels](#macro-economic-panels)
12. [Project Structure](#project-structure)
13. [API Reference](#api-reference)
14. [Installation & Setup](#installation--setup)
15. [Configuration](#configuration)
16. [Tech Stack](#tech-stack)
17. [Known Limitations & Disclaimer](#known-limitations--disclaimer)

---

## Overview

Ticker-Teller is a research-grade, full-stack financial forecasting application that combines classical quantitative finance features with a modern hybrid deep-learning architecture. It fetches live market data from Yahoo Finance, engineers 31 input features spanning price action, momentum indicators, bond yields, and commodities, trains a CNN → BiLSTM → Multi-Head Attention model in real time, and streams every training epoch back to the browser via Server-Sent Events (SSE).

The frontend is a single-page React/Vite application with dark-mode design, live training dashboards, interactive price/RSI/volume charts, and a suite of macro-economic panels covering global bond yields, commodity forecasts, and GDP proxies.

---

## Live Demo Preview

<img width="1920" height="1031" alt="opening window" src="https://github.com/user-attachments/assets/29d15029-9edf-4788-aeb9-a01cad4c9b8f">
<br>
<img width="1920" height="1031" alt="running ticker=AAPL" src="https://github.com/user-attachments/assets/75c988c7-e35f-408b-a48e-0fc29c89421f">
<br>
<img width="1920" height="1031" alt="fuzzy logic implementation,AAPL" src="https://github.com/user-attachments/assets/367bed41-1bdf-44f0-a5cf-fcf89aabda63" />
<img width="1920" height="950" alt="continuation" src="https://github.com/user-attachments/assets/a0ba7d63-1c50-4b51-a0da-88fdbd3c3982" />
<br>
<img width="1920" height="950" alt="MACD" src="https://github.com/user-attachments/assets/d8e24642-3603-449b-ac96-6857aa0351d6" />

---

## Feature Highlights

### Core Analysis
- **31 Input Features** — 17 price/technical + 14 macro/quantitative factors
- **Real-Time SSE Streaming** — live epoch-by-epoch training progress (loss, LR, sparkline) pushed to the browser with no polling
- **AI Signal** — BUY / SELL / NEUTRAL badge derived from MC forecast vs current price
- **Train / Val / Test Split Pills** — visual confirmation of data split sizes

### Deep Learning
- **Hybrid Architecture** — Temporal CNN → Bidirectional LSTM → Multi-Head Self-Attention
- **MC-Dropout Forecasting** — 80 stochastic forward passes produce ±1σ confidence bands
- **Log-Return Targets** — model predicts log-returns (stationary) rather than raw prices
- **Cosine Annealing Warm Restarts** — adaptive learning rate schedule with periodic resets
- **Gradient Clipping** — max-norm 1.0 stabilises training on volatile equities
- **Early Stopping** — best-val-loss weights are automatically restored

### Risk Analysis
- **Fuzzy C-Means (FCM)** — pure-NumPy implementation, c=2 clusters, fuzzifier m=2
- **Year-Wise Membership** — daily fuzzy high-risk scores averaged per calendar year
- **Overall Mean Score** — single holistic risk figure for the full history
- **Cluster Centre Volatilities** — annualised volatility at each FCM centroid

### Charts
- **Price Chart** — historical close, Bollinger Bands, test-set actual vs predicted, MC forecast with ±1σ bands; 1M / 3M / 6M / 1Y / 2Y / ALL range buttons
- **RSI (14)** — overbought (>70) / oversold (<30) sub-chart
- **Volume** — colour-coded bars (green = up-day, red = down-day)
- **MACD** — MACD line, signal line, and histogram
- **Training Loss** — train vs val loss curves with best-epoch marker
- **Feature Correlations** — Pearson correlation bar chart and table

### Macro-Economic Panels (☰ More Analysis)
- **Commodities** — Gold, Silver, Copper, Aluminium, Brent Oil; Holt-Winters forecast + ±1σ bands + industry impact modal
- **GDP Proxies** — 7 country ETF-return proxies + IMF consensus estimates + Holt forecast
- **Bond Yields** — US 5Y/10Y (Yahoo Finance direct) + India, Germany, UK, Japan (ETF-anchored proxies); yield-curve inversion alert
- **Correlations** — feature-by-feature Pearson correlation with close price

---

## System Architecture

```
Browser (React / Vite)
        │
        │  HTTP + SSE (via Vite dev proxy → /api/*)
        ▼
FastAPI Backend (Python 3.11+)
        │
        ├── /api/analyze           POST — SSE stream (train + forecast)
        ├── /api/commodities       GET  — Holt-Winters commodity forecast
        ├── /api/gdp               GET  — ETF-based GDP proxy + forecast
        ├── /api/bonds             GET  — US Treasuries + ETF yield proxies
        ├── /api/ticker-info       GET  — Sector / Industry metadata
        └── /api/health            GET  — Version + device check
        │
        ├── src/data.py            Feature engineering, data fetching, FCM
        └── src/model.py           PyTorch model, training loop, MC forecast
        │
        └── Yahoo Finance (yfinance) — live price, ETF, futures data
```

The backend uses two `ThreadPoolExecutor` pools — a small 2-worker pool for GPU/CPU training (to avoid contention) and an 8-worker pool for concurrent data-fetch endpoints. A `threading.Event` cancellation token propagates client-disconnect signals into the training loop, stopping work immediately when the browser tab is closed.

All slow data fetches are cached in-memory for 1 hour (`_TTL = 3600s`) using a simple `_CACHE` dictionary keyed by `"type:ticker:period"`.

---

## Model Architecture

```
Input: [Batch, SeqLen, 31 Features]
         │
         ▼
┌─────────────────────────────────────────────┐
│  TemporalConvBlock (Inception-style CNN)    │
│  ├── Conv1d(kernel=3) → BN → GELU           │
│  ├── Conv1d(kernel=5) → BN → GELU           │
│  ├── Concat → Conv1d(1×1) → BN → GELU       │
│  └── Residual projection + Dropout          │
└─────────────────────────────────────────────┘
         │  [Batch, SeqLen, CNN_Channels]
         ▼
┌─────────────────────────────────────────────┐
│  Bidirectional LSTM                         │
│  hidden_size=128, num_layers=2              │
│  → output: [Batch, SeqLen, 256]             │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  MultiHeadAttentionBlock                    │
│  MultiheadAttention(d_model=256, heads=4)   │
│  Residual + LayerNorm                       │
└─────────────────────────────────────────────┘
         │  [Batch, SeqLen, 256]
         ▼
  Temporal soft-attention pooling
  (learned linear score over time → weighted sum)
         │  [Batch, 256]
         ▼
┌─────────────────────────────────────────────┐
│  MLP Head                                   │
│  Dropout → Linear(256→128) → GELU           │
│  → Dropout → Linear(128→1)                  │
└─────────────────────────────────────────────┘
         │
         ▼
  Output: predicted log-return (scalar)
```

### Key Design Choices

| Component | Choice | Rationale |
|---|---|---|
| Targets | Log-returns | Stationary; avoids price-scale sensitivity |
| CNN kernels | 3 and 5 (dual) | Captures short and medium-range local patterns simultaneously |
| BiLSTM | Bidirectional | Forward and backward temporal context |
| Attention | Soft temporal pooling | Learns which time steps in the sequence matter most |
| MC-Dropout | eval() + re-enable Dropout | BatchNorm frozen during inference; only Dropout remains stochastic |

---

## Input Feature Engineering

### Price & Technical Features (17)

| Feature | Description |
|---|---|
| Open, High, Low, Close, Volume | Raw OHLCV from Yahoo Finance |
| SMA_10, SMA_50 | 10-day and 50-day simple moving averages |
| MACD, MACD_Signal | 12/26 EMA difference and its 9-period EMA |
| RSI | 14-period Relative Strength Index (Wilder smoothing) |
| ROC_10 | 10-day Rate of Change (%) |
| Stoch_K | 14-period Stochastic Oscillator %K |
| BB_Upper, BB_Lower | 20-day Bollinger Bands (±2σ) |
| ATR | 14-period Average True Range |
| OBV_norm | On-Balance Volume, z-scored over a 20-day window |
| RVI | Relative Volatility Index (range-based RSI analogue) |

### Quantitative & Macro Features (14)

| Feature | Description |
|---|---|
| Beta_60 | 60-day rolling beta vs SPY (OLS regression on log-returns) |
| Alpha_60 | 60-day rolling Jensen's alpha (annualised) |
| Momentum_12_1 | 12-month minus 1-month return — standard momentum factor |
| Sharpe_60 | 60-day rolling annualised Sharpe ratio |
| Vol_Ratio | Short-term (10d) vs long-term (60d) volatility ratio |
| Mkt_Return | SPY daily log-return |
| Bond_5Y, Bond_10Y | US Treasury yields via Yahoo Finance (^FVX, ^TNX) |
| Gold, Silver, Copper, Aluminium, Brent_Oil | Commodity futures prices (GC=F, SI=F, HG=F, ALI=F, BZ=F) |
| Buffett_Proxy | SPY price / SPY 252-day SMA × 100 — market valuation proxy |

All features are scaled to [0, 1] via `MinMaxScaler` before being fed into the model.

---

## Loss Function

```
L = Huber(δ=0.01) + 0.4 × DirectionalPenalty
```

### Huber Loss
Robust to outlier log-returns (large single-day moves). The small delta (δ=0.01) means it operates in the linear regime for most typical daily moves.

### Directional Penalty
```python
dir_penalty = mean( relu( -sign(pred) * sign(target) ) )
```
Fires a constant penalty of 1.0 for every prediction that gets the direction wrong, regardless of magnitude. This corrects a subtle bug where the naive product `pred * target` produces near-zero penalties for small log-returns, making the 0.4 weight meaningless. The sign-based version ensures the direction term is always meaningful.

---

## Training Pipeline

```
1. Fetch OHLCV + sync macro factors (bonds, commodities, market)
2. Engineer all 31 features
3. Compute FCM risk on the full feature dataframe
4. Scale to [0, 1] with MinMaxScaler
5. Build overlapping sequences of length seq_length
6. Split 70% train / 15% val / 15% test (time-ordered, no shuffling)
7. Wrap in DataLoaders (batch_size=32, pin_memory if CUDA)
8. Train with AdamW + CosineAnnealingWarmRestarts
   — Gradient clip max_norm=1.0
   — Early stopping (patience=10 default; restores best val-loss weights)
   — Every epoch → SSE event pushed to browser
9. Predict test set → convert log-returns to prices → compute metrics
10. Run Monte Carlo forecast for next N days
11. Return full result payload via SSE "result" event
```

---

## Monte Carlo Uncertainty Estimation

During forecasting the model is put into `eval()` mode (which freezes BatchNorm running statistics) but all `nn.Dropout` layers are explicitly switched back to `train()` mode. This is the correct MC-Dropout approach — using `model.train()` naively would corrupt BatchNorm stats when inferring on a single rolling window (batch size = 1).

```python
model.eval()
for m in model.modules():
    if isinstance(m, nn.Dropout):
        m.train()
```

80 stochastic forward passes are run per forecast step. The mean log-return predicts the next price; the standard deviation gives the ±1σ band. The forecast window is rolled forward autoregressively, updating the input sequence with the predicted close each step.

---

## Fuzzy C-Means Risk Analysis

### Algorithm (pure NumPy — no external fuzzy library)

FCM is implemented from scratch using NumPy to avoid scikit-fuzzy dependency issues.

**Input features (per trading day):**

| Feature | Window | Description |
|---|---|---|
| Annualised Volatility | 21 days | `std(log_returns) × √252` |
| Rolling Beta | 60 days | Covariance(stock, market) / Var(market) |
| Max Drawdown | 60 days | `(close - rolling_max) / rolling_max` |

**FCM parameters:** c=2 clusters, fuzzifier m=2, max 200 iterations, convergence ε=1e-5.

**High-risk cluster identification:** The cluster with the higher normalised-volatility centre is labelled "high risk". Every trading day then receives a continuous membership score in [0, 1] for this cluster — unlike k-means hard labels.

**Year-wise aggregation:**
```
yearly[year] = mean(high_risk_membership[all days in year])
overall_mean = mean(yearly.values())
```

**Risk labels:**
- Score ≥ 0.65 → **High Risk** (red)
- Score ≥ 0.40 → **Moderate Risk** (amber)
- Score < 0.40 → **Low Risk** (green)

---

## Macro-Economic Panels

### Commodities Panel
Fetches 5 futures via yfinance (GC=F, SI=F, HG=F, ALI=F, BZ=F) and applies **Holt's Linear (Double) Exponential Smoothing** (α=0.3, β=0.1) to produce a multi-day forecast with ±1σ confidence bands. The trend is initialised using the global slope `(s[-1] - s[0]) / (n-1)` — a fix from the naive single-step initialisation which produced noisy trend estimates.

Each commodity card has a 🏭 Industries button that opens a modal showing sector-sensitivity impact analysis for the 5 most relevant industries (e.g. Airlines for Brent Oil, Solar/EV for Silver). **All industry prices are clearly labelled as illustrative simulations** seeded by date — not live quotes.

### Bond Yields Panel
- **US 5Y / 10Y**: fetched directly from Yahoo Finance (^FVX, ^TNX)
- **India, Germany, UK, Japan 10Y**: ETF-anchored synthetic yields — ETF log-return drift is normalised and combined with a fixed anchor (e.g. India 6.80%, Germany 2.45%) plus US10Y sensitivity factor
- **Yield curve inversion alert**: fires when US 10Y < US 5Y with historical recession context

### GDP Proxy Panel
Uses annualised 252-day ETF returns (SPY, INDA, FXI, EZU, EWJ, EWU, EWZ) as directional proxies for economic momentum, with Holt smoothing for the 30-day forecast. **IMF/World Bank consensus GDP estimates are shown alongside ETF returns** so users are never misled about the magnitude difference (e.g. SPY +36% ≠ US GDP +36%).

### Correlations Panel
Pearson correlation between each of the 31 features and the close price, computed on the full engineered dataframe. Available after running an analysis. Features include Bond_10Y, Gold, Brent_Oil, Buffett_Proxy, RSI, Beta_60, MACD, Silver, Copper.

---

## Project Structure

```
ticker-teller/
│
├── backend/
│   ├── main.py                   # FastAPI server — all API endpoints
│   └── src/
│       ├── __init__.py           # Package version (3.2.0)
│       ├── data.py               # Feature engineering, data fetching,
│       │                         # FCM risk, Holt forecasting, GDP proxies
│       └── model.py              # PyTorch model, training loop,
│                                 # MC forecast, metrics
│
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js            # Dev proxy → /api/* → :8000
    └── src/
        ├── main.jsx              # React root
        ├── App.jsx               # Root component, SSE state machine,
        │                         # tab routing, hamburger nav
        ├── api.js                # fetch wrappers + SSE stream client
        ├── styles/
        │   └── globals.css       # Full design system (tokens, layout,
        │                         # components, animations)
        └── components/
            ├── Sidebar.jsx       # Config panel, sliders, run button
            ├── TrainingProgress.jsx  # Live epoch stats + sparkline
            ├── MetricCards.jsx   # 5 summary KPI cards
            ├── PriceChart.jsx    # Price/BB/RSI/Volume + range buttons
            ├── LossAndMacdCharts.jsx  # Loss curve + MACD
            ├── FcmRiskPanel.jsx  # FCM bar chart + year table
            ├── MetricCards.jsx   # KPI metric grid
            ├── CommodityPanel.jsx  # Commodity cards + forecast + industries modal
            ├── GdpPanel.jsx      # GDP cards + ETF trend + IMF bar chart
            ├── BondPanel.jsx     # Yield cards + historical + spread chart
            └── CorrelationAndAbout.jsx  # Correlation bar chart + About modal
```

---

## API Reference

### `POST /api/analyze`
Streams a Server-Sent Events response. Each frame is a JSON object with a `type` field.

**Request body:**
```json
{
  "ticker":        "AAPL",
  "period":        730,
  "seq_length":    60,
  "forecast_days": 5,
  "epochs":        50,
  "patience":      10,
  "hidden_size":   128,
  "cnn_channels":  64,
  "num_heads":     4,
  "dropout":       0.2
}
```

**SSE event types:**

| Type | Payload fields | Description |
|---|---|---|
| `status` | `message: str` | Human-readable progress log |
| `epoch` | `epoch, total, train_loss, val_loss, lr` | Per-epoch training stats |
| `result` | See below | Full analysis result |
| `error` | `message, traceback` | Error with full Python traceback |

**`result` payload shape:**
```json
{
  "ticker": "AAPL",
  "currency": "$",
  "device": "cuda",
  "features": { "total": 31, "price": 17, "macro": 14 },
  "splits":   { "n_train": 420, "n_val": 90, "n_test": 90 },
  "model":    { "total_params": 485121, "trainable_params": 485121 },
  "fcm_risk": {
    "yearly": { "2020": 0.712, "2021": 0.441, ... },
    "overall_mean": 0.561,
    "current_score": 0.684,
    "risk_label": "High Risk",
    "cluster_centers": [12.4, 34.7],
    "high_risk_centre_idx": 1
  },
  "summary": {
    "last_price": 189.30,
    "next_price": 192.14,
    "pct_change": 1.50,
    "volatility": 0.267,
    "signal": "BUY",
    "badge": "bull"
  },
  "metrics": {
    "mae": 3.42, "rmse": 4.87,
    "mape": 1.92, "directional_accuracy": 58.3
  },
  "charts": {
    "historical": [ { "date", "close", "bb_upper", "bb_lower", "rsi", "macd", "macd_sig", "volume" } ],
    "test":       [ { "date", "actual", "predicted" } ],
    "forecast":   [ { "date", "mean", "upper", "lower" } ],
    "loss":       [ { "epoch", "train", "val" } ],
    "correlations": [ { "feature", "correlation" } ]
  }
}
```

---

### `GET /api/commodities`
| Query param | Type | Default | Range |
|---|---|---|---|
| `period` | int | 730 | 90 – 1825 |
| `forecast_days` | int | 10 | 1 – 30 |

Returns per-commodity: `last_price`, `means`, `upper`, `lower`, `pct_change_1d`, `dates`, `history_prices`, `history_dates`, `alpha`, `beta`.

---

### `GET /api/gdp`
| Query param | Type | Default | Range |
|---|---|---|---|
| `period` | int | 730 | 90 – 1825 |
| `forecast_days` | int | 30 | 1 – 90 |

Returns per-country: `current_annual_pct`, `forecast_pct`, `upper_pct`, `lower_pct`, `source`, `forecast_dates`.

---

### `GET /api/bonds`
| Query param | Type | Default | Range |
|---|---|---|---|
| `period` | int | 730 | 90 – 1825 |

Returns: `rows` (time series), `columns`, `latest` (with `spread` and `inverted`), `countries` (nested by tenor).

---

### `GET /api/ticker-info`
| Query param | Type |
|---|---|
| `ticker` | str |

Returns: `name`, `sector`, `industry`, `currency`.

---

### `GET /api/health`
Returns: `{ "status": "ok", "version": "3.1.1", "device": "cpu|cuda", "features": 31 }`.

---

## Installation & Setup

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- (Optional) CUDA-capable GPU with PyTorch CUDA build

---

### 1. Backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn[standard] torch torchvision \
            yfinance pandas numpy scikit-learn pydantic

# Start the API server
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

The backend will be available at `http://127.0.0.1:8000`. Visit `/docs` for the auto-generated Swagger UI.

---

### 2. Frontend

```bash
cd frontend

npm install
npm run dev
```

The dev server starts at `http://localhost:5173`. All `/api/*` requests are proxied through Vite to `http://127.0.0.1:8000` — no CORS issues, no hardcoded host.

---

### 3. (Optional) Production Build

```bash
# Frontend
cd frontend && npm run build    # outputs to frontend/dist/

# Serve static files from FastAPI
# Add StaticFiles mount in main.py:
# app.mount("/", StaticFiles(directory="../frontend/dist", html=True), name="static")

uvicorn main:app --host 0.0.0.0 --port 8000
```

---

### 4. Docker (optional sketch)

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY . .
RUN pip install fastapi uvicorn torch yfinance pandas numpy scikit-learn pydantic
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```yaml
# docker-compose.yml
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    environment:
      - VITE_API_BASE=http://backend:8000
```

---

## Configuration

All model and data parameters are set from the UI sidebar. Defaults are:

| Parameter | Default | Range | Description |
|---|---|---|---|
| `ticker` | AAPL | any Yahoo Finance symbol | Stock ticker (e.g. AAPL, RELIANCE.NS, BTC-USD) |
| `period` | 730 | 365 – 1825 days | Calendar days of price history to download |
| `seq_length` | 60 | 10 – 120 | Rolling lookback window (trading days) per sample |
| `forecast_days` | 5 | 1 – 30 | Number of future business days to forecast |
| `epochs` | 50 | 5 – 200 | Maximum training epochs |
| `patience` | 10 | 3 – 30 | Early-stopping patience (epochs without val improvement) |
| `hidden_size` | 128 | 32, 64, 128, 256 | BiLSTM hidden units (output = 2× this) |
| `cnn_channels` | 64 | 32, 64, 128 | CNN output channels |
| `num_heads` | 4 | 2, 4, 8 | Multi-head attention heads |
| `dropout` | 0.2 | 0.0 – 0.5 | Dropout rate (also controls MC uncertainty band width) |

### Currency Auto-Detection
The backend infers the display currency from the ticker suffix:

| Suffix | Currency |
|---|---|
| `.NS`, `.BO` | ₹ Indian Rupee |
| `.L` | £ British Pound |
| `.HK` | HK$ Hong Kong Dollar |
| `.DE`, `.PA`, `.EU`, `.AS`, `.MI` | € Euro |
| (default) | $ US Dollar |

---

## Tech Stack

### Backend
| Library | Version | Purpose |
|---|---|---|
| FastAPI | latest | Async REST + SSE streaming |
| PyTorch | 2.x | Model definition, training, inference |
| yfinance | 0.2.x | Live market data fetching |
| pandas | 2.x | Time-series data manipulation |
| NumPy | 1.26+ | Numerical computing, FCM implementation |
| scikit-learn | 1.x | MinMaxScaler feature normalisation |
| Pydantic | 2.x | Request validation |
| uvicorn | latest | ASGI server with async support |

### Frontend
| Library | Version | Purpose |
|---|---|---|
| React | 18.3 | UI framework |
| Vite | 5.3 | Dev server + bundler with SSE proxy |
| Recharts | 2.12 | All charts (ComposedChart, BarChart, LineChart) |
| Lucide React | 0.383 | Icon set |
| Axios | 1.7 | HTTP client (non-streaming requests) |
| clsx | 2.1 | Conditional class names |
| JetBrains Mono | Google Fonts | Monospace typography |
| Source Sans 3 | Google Fonts | Display typography |

---

## Known Limitations & Disclaimer

> ⚠ **This application is for educational and research purposes only. Nothing in Ticker-Teller constitutes financial advice. All forecasts carry significant model risk and uncertainty. Do not use as the sole basis for any financial or investment decisions.**

### Technical Limitations

- **Data quality**: Yahoo Finance data can have gaps, split/dividend adjustments, and occasional erroneous ticks. The pipeline applies `ffill/bfill` and zero-fill as fallbacks but cannot guarantee clean data for all tickers.
- **GDP panel values**: The "GDP" figures displayed are annualised ETF returns used as directional proxies. They are not official GDP statistics and can differ from real GDP growth rates by an order of magnitude (e.g. SPY +36% ≠ US GDP +36%). IMF consensus estimates are shown alongside for comparison.
- **Bond yield proxies**: Non-US yields (India, Germany, UK, Japan) are synthetic — derived from ETF price momentum anchored to a fixed reference rate. They are indicative, not authoritative.
- **Industry impact modal**: All prices shown in the industry impact analysis are illustrative simulations generated from sector-sensitivity coefficients seeded by today's date. They are not live market quotes.
- **MC-Dropout calibration**: Uncertainty bands reflect model parameter uncertainty (epistemic) but not data uncertainty (aleatoric). Bands may be narrow in low-volatility regimes and wide in high-volatility ones — use as qualitative guidance only.
- **Single-file model**: No model persistence is implemented. Each Run re-trains from scratch. For production use, add model checkpointing.
- **In-memory cache**: The 1-hour `_CACHE` dictionary is per-process and lost on restart. For multi-worker deployments use Redis or a shared cache.
- **Concurrent training**: The `_train_executor` is limited to 2 workers. Multiple simultaneous analysis requests will queue.

### Data Sources
All market data is sourced from Yahoo Finance via `yfinance`. Usage is subject to Yahoo Finance's terms of service.

---

*Built with PyTorch, FastAPI, React, and Recharts.*
