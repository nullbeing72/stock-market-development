"""
backend/main.py — Ticker-Teller FastAPI server v1.1
Fixes:
  - Commodity endpoint: private imports moved to module level
  - SSE run() now checks a cancellation Event so background work stops on disconnect
  - result payload includes adc_risk from compute_adc_risk() (IDEC autoencoder deep clustering)
  - test_start_idx mapping clearly documented
"""

from __future__ import annotations

import asyncio
import json
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Event as ThreadEvent
from typing import Any, AsyncGenerator

import numpy as np
import pandas as pd
import torch
import yfinance as yf
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sklearn.preprocessing import MinMaxScaler

# FIX: move all src.data imports to module level (previously some were inside the
# commodity endpoint function body referencing private symbols — fragile and
# invisible to linters/type checkers).
from src.data import (
    fetch_data, fetch_market_data, fetch_bond_yields, fetch_commodities,
    add_technical_features, add_quant_features,
    build_sequences, split_data, returns_to_prices,
    forecast_commodity_prices, forecast_gdp_growth,
    compute_macro_correlations, compute_adc_risk,
    _COMMODITY_TICKERS, _normalize_columns,          # now safe at module level
    FEATURE_COLS, N_PRICE_FEATURES, N_FACTOR_FEATURES,
)
from src.model import (
    make_loaders, train_model, predict_test_set,
    monte_carlo_forecast, compute_metrics, model_summary,
)

# ── App Configuration ────────────────────────────────────────────────────────
app = FastAPI(title="Ticker-Teller API", version="3.1.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Two executors: small one for heavyweight training, larger for data fetches
_train_executor = ThreadPoolExecutor(max_workers=2)
_data_executor  = ThreadPoolExecutor(max_workers=8)

# ── Helpers ──────────────────────────────────────────────────────────────────
class _Enc(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.integer,)):    return int(obj)
        if isinstance(obj, (np.floating,)):   return float(obj)
        if isinstance(obj, np.bool_):         return bool(obj)
        if isinstance(obj, np.ndarray):       return obj.tolist()
        if isinstance(obj, pd.Timestamp):     return obj.isoformat()
        return super().default(obj)

def _json(obj: Any) -> str:
    return json.dumps(obj, cls=_Enc)

def _sse(event_type: str, data: dict) -> str:
    payload = {"type": event_type}
    payload.update(data)
    return f"data: {_json(payload)}\n\n"

def _currency(ticker: str) -> str:
    t = ticker.upper()
    if t.endswith(".NS") or t.endswith(".BO"): return "₹"
    if t.endswith(".L"):  return "£"
    if t.endswith(".HK"): return "HK$"
    if any(t.endswith(s) for s in (".DE", ".PA", ".EU", ".AS", ".MI")): return "€"
    return "$"

def _signal_badge(signal: str) -> str:
    s = signal.upper()
    if s == "BUY":  return "bull"
    if s == "SELL": return "bear"
    return "neutral"

# ── Request Schema ───────────────────────────────────────────────────────────
class AnalyzeConfig(BaseModel):
    ticker:        str   = Field("AAPL", min_length=1, max_length=20)
    period:        int   = Field(730, ge=180, le=1825)
    seq_length:    int   = Field(60,  ge=10,  le=120)
    forecast_days: int   = Field(5,   ge=1,   le=30)
    epochs:        int   = Field(50,  ge=5,   le=200)
    patience:      int   = Field(10,  ge=3,   le=30)
    hidden_size:   int   = Field(128)
    cnn_channels:  int   = Field(64)
    num_heads:     int   = Field(4)
    dropout:       float = Field(0.2, ge=0.0, le=0.5)

# ── /api/analyze ─────────────────────────────────────────────────────────────
@app.post("/api/analyze")
async def analyze(cfg: AnalyzeConfig):
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    # FIX: cancellation token so the training thread stops when client disconnects
    cancel_event = ThreadEvent()

    def run():
        def push(event_type: str, **kwargs):
            if cancel_event.is_set():
                return
            asyncio.run_coroutine_threadsafe(queue.put(_sse(event_type, kwargs)), loop)

        try:
            ticker   = cfg.ticker.upper().strip()
            currency = _currency(ticker)

            push("status", message=f"Fetching price data for {ticker}…")
            df_raw = fetch_data(ticker, cfg.period)
            if df_raw is None or df_raw.empty:
                push("error", message=f"No data found for ticker '{ticker}'. Check the symbol and try again.")
                return

            if cancel_event.is_set(): return

            push("status", message="Syncing macro factors, bond yields & commodities…")
            _market   = fetch_market_data(cfg.period)
            market_df = _market if _market is not None else df_raw[["Close"]].copy()
            bond_df   = fetch_bond_yields(cfg.period)
            comm_df   = fetch_commodities(cfg.period)

            if bond_df is None:
                print("[warn] bond_df fetch failed — Bond_5Y / Bond_10Y will be zeroed")
            if comm_df is None:
                print("[warn] comm_df fetch failed — commodity features will be zeroed")

            push("status", message=f"Engineering {len(FEATURE_COLS)} features across {len(df_raw)} trading days…")
            df = add_technical_features(df_raw)
            df = add_quant_features(df, market_df, bond_df, comm_df)

            for c in FEATURE_COLS:
                if c not in df.columns:
                    df[c] = 0.0

            # FIX: ffill/bfill first, then fill any remaining NaNs (e.g. entirely-NaN
            # macro columns when bond/commodity fetches fail) with 0 so dropna()
            # does not wipe every row.  dropna(how='all') removes only blank rows.
            df = (
                df[FEATURE_COLS]
                .ffill()
                .bfill()
                .fillna(0.0)
                .dropna(how="all")
            )

            if len(df) < cfg.seq_length + 20:
                push("error", message=f"Insufficient data ({len(df)} rows) for sequence length {cfg.seq_length}. Reduce lookback or increase history period.")
                return

            if cancel_event.is_set(): return

            # ADC risk analysis — IDEC autoencoder deep clustering on full feature set
            push("status", message="Running Autoencoder Deep Clustering risk analysis…")
            adc_risk = compute_adc_risk(df)

            # Preprocessing
            scaler      = MinMaxScaler(feature_range=(0, 1))
            scaled_data = scaler.fit_transform(df.values)
            raw_close   = df["Close"].values

            X, y = build_sequences(scaled_data, raw_close, cfg.seq_length)
            (X_train, y_train), (X_val, y_val), (X_test, y_test), split, train_end = split_data(X, y)

            n_train = len(X_train)
            n_val   = len(X_val)
            n_test  = len(X_test)

            train_loader, val_loader, test_loader = make_loaders(
                X_train, y_train, X_val, y_val, X_test, y_test
            )
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

            push("status", message=f"Training CNN → BiLSTM → Attention on {device.type.upper()} ({n_train} train / {n_val} val / {n_test} test samples)…")

            def epoch_cb(epoch, total, t_loss, v_loss, lr):
                if cancel_event.is_set():
                    return False   # returning False stops training immediately
                push("epoch", epoch=epoch, total=total, train_loss=t_loss, val_loss=v_loss, lr=lr)
                return True

            model, loss_history = train_model(
                train_loader, val_loader,
                input_size   = len(FEATURE_COLS),
                epochs       = cfg.epochs,
                patience     = cfg.patience,
                device       = device,
                hidden_size  = cfg.hidden_size,
                dropout      = cfg.dropout,
                cnn_channels = cfg.cnn_channels,
                num_heads    = cfg.num_heads,
                epoch_callback = epoch_cb,
            )

            if cancel_event.is_set(): return

            push("status", message="Running Monte Carlo uncertainty estimation (80 samples)…")
            pred_log_returns, actual_log_returns = predict_test_set(model, test_loader, device)

            # FIX: clearly document the index mapping.
            # X[i] uses df rows [i .. i+seq_length-1], so X[0] starts at df row 0.
            # test split starts at index `split` in the X/y arrays.
            # The corresponding df row is: seq_length + split.
            # The anchor price (last known actual before test window) is at df row
            # seq_length + split - 1.
            test_start_idx   = cfg.seq_length + split          # df row of first test window end
            test_anchor_idx  = max(test_start_idx - 1, 0)      # df row of anchor price
            test_start_price = float(df["Close"].iloc[test_anchor_idx])

            actual_prices    = returns_to_prices(actual_log_returns, test_start_price)
            pred_prices      = returns_to_prices(pred_log_returns,   test_start_price)

            # Per-step chart: anchor each prediction to the actual previous close
            actual_close_arr = df["Close"].values
            anchor_idx = np.clip(
                np.arange(test_anchor_idx, test_anchor_idx + len(pred_log_returns)),
                0, len(actual_close_arr) - 1,
            )
            pred_prices_chart = actual_close_arr[anchor_idx] * np.exp(pred_log_returns)

            metrics  = compute_metrics(pred_prices, actual_prices)
            last_close = float(df_raw["Close"].iloc[-1])

            mc_raw = monte_carlo_forecast(
                model          = model,
                scaled_data    = scaled_data,
                raw_close_last = last_close,
                scaler         = scaler,
                input_size     = len(FEATURE_COLS),
                seq_length     = cfg.seq_length,
                forecast_days  = cfg.forecast_days,
                device         = device,
            )

            future_dates = pd.date_range(
                df_raw.index[-1], periods=cfg.forecast_days + 1, freq="B"
            )[1:]

            # Build rich historical rows for charts
            hist_rows = []
            df_index_set = set(df.index)
            for d, row in df_raw.iterrows():
                df_row = df.loc[d] if d in df_index_set else None
                hist_rows.append({
                    "date":     str(d.date()),
                    "close":    float(row["Close"]),
                    "bb_upper": float(df_row["BB_Upper"]) if df_row is not None and "BB_Upper" in df_row.index else None,
                    "bb_lower": float(df_row["BB_Lower"]) if df_row is not None and "BB_Lower" in df_row.index else None,
                    "rsi":      float(df_row["RSI"])      if df_row is not None and "RSI"      in df_row.index else None,
                    "macd":     float(df_row["MACD"])     if df_row is not None and "MACD"     in df_row.index else None,
                    "macd_sig": float(df_row["MACD_Signal"]) if df_row is not None and "MACD_Signal" in df_row.index else None,
                    "volume":   float(row["Volume"]) if "Volume" in row.index else None,
                })

            # Signal: protect against NaN forecast
            mc_mean_0 = mc_raw[0]["mean"] if mc_raw else last_close
            if np.isnan(mc_mean_0) or mc_mean_0 <= 0:
                mc_mean_0 = last_close
            signal    = "BUY" if mc_mean_0 > last_close else "SELL"
            badge     = _signal_badge(signal)
            pct_change = ((mc_mean_0 - last_close) / max(last_close, 1e-9)) * 100
            m_summary  = model_summary(model)

            push("result",
                ticker   = ticker,
                currency = currency,
                device   = device.type,
                features = {
                    "total": len(FEATURE_COLS),
                    "price": N_PRICE_FEATURES,
                    "macro": N_FACTOR_FEATURES,
                },
                splits = {
                    "n_train": n_train,
                    "n_val":   n_val,
                    "n_test":  n_test,
                },
                model    = m_summary,
                adc_risk  = adc_risk,
                summary  = {
                    "last_price": last_close,
                    "next_price": mc_mean_0,
                    "pct_change": pct_change,
                    "volatility": float(df_raw["Close"].pct_change().std() * np.sqrt(252)),
                    "signal":     signal,
                    "badge":      badge,
                },
                metrics  = metrics,
                charts   = {
                    "historical": hist_rows,
                    "test": [
                        {
                            "date":      str(df.index[min(test_start_idx + i, len(df.index) - 1)].date()),
                            "actual":    float(actual_prices[i]),
                            "predicted": float(pred_prices_chart[i]),
                        }
                        for i in range(len(actual_prices))
                    ],
                    "forecast": [
                        {
                            "date":  str(future_dates[i].date()),
                            "mean":  float(mc_raw[i]["mean"]),
                            "upper": float(mc_raw[i]["mean"] + mc_raw[i]["std"]),
                            "lower": float(mc_raw[i]["mean"] - mc_raw[i]["std"]),
                        }
                        for i in range(cfg.forecast_days)
                    ],
                    "loss": [
                        {"epoch": i + 1, "train": t, "val": v}
                        for i, (t, v) in enumerate(
                            zip(loss_history["train"], loss_history["val"])
                        )
                    ],
                    "correlations": [
                        {"feature": idx, "correlation": float(row["correlation"])}
                        for idx, row in compute_macro_correlations(df).iterrows()
                    ],
                },
            )

        except Exception as exc:
            push("error", message=str(exc), traceback=traceback.format_exc())
        finally:
            asyncio.run_coroutine_threadsafe(queue.put(None), loop)

    future = loop.run_in_executor(_train_executor, run)
    future.add_done_callback(
        lambda f: f.exception() and
        print(f"[analyze] unhandled executor error: {f.exception()}")
    )

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield item
        except asyncio.CancelledError:
            # Client disconnected — signal the training thread to stop
            cancel_event.set()
            raise

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )

# ── /api/commodities ─────────────────────────────────────────────────────────
@app.get("/api/commodities")
async def commodities_endpoint(
    period:        int = Query(730, ge=90,  le=1825),
    forecast_days: int = Query(10,  ge=1,   le=30),
):
    loop = asyncio.get_running_loop()

    def _fetch():
        data = forecast_commodity_prices(period, forecast_days)
        # Attach recent history for the historical chart
        history_days = min(period, 90)
        end   = datetime.today()
        start = end - timedelta(days=history_days + 30)
        for name, ticker in _COMMODITY_TICKERS.items():
            try:
                raw = yf.download(ticker, start=start, end=end, progress=False, auto_adjust=True)
                if raw.empty:
                    continue
                raw = _normalize_columns(raw)
                prices = raw["Close"].dropna()
                data[name]["history_prices"] = [float(p) for p in prices.values]
                data[name]["history_dates"]  = [str(d.date()) for d in prices.index]
                data[name]["alpha"] = 0.3
                data[name]["beta"]  = 0.1
            except Exception:
                pass
        return data

    return await loop.run_in_executor(_data_executor, _fetch)

# ── /api/gdp ─────────────────────────────────────────────────────────────────
@app.get("/api/gdp")
async def gdp_endpoint(
    period:        int = Query(730, ge=90,  le=1825),
    forecast_days: int = Query(30,  ge=1,   le=90),
):
    loop = asyncio.get_running_loop()

    def _fetch():
        data = forecast_gdp_growth(period, forecast_days)
        today = datetime.today()
        dates = [str((today + timedelta(days=i)).date()) for i in range(1, forecast_days + 1)]
        for country in data:
            data[country]["forecast_dates"] = dates
        return data

    return await loop.run_in_executor(_data_executor, _fetch)

# ── /api/bonds ───────────────────────────────────────────────────────────────
@app.get("/api/bonds")
async def bonds_endpoint(period: int = Query(730, ge=90, le=1825)):
    loop = asyncio.get_running_loop()

    def _fetch():
        bond_df = fetch_bond_yields(period)
        if bond_df is None or bond_df.empty:
            return {"rows": [], "columns": [], "latest": {}, "countries": {}}

        available_cols = [c for c in bond_df.columns if not bond_df[c].isna().all()]

        rows = []
        for date, row in bond_df.iterrows():
            entry = {"date": str(date.date())}
            for col in available_cols:
                entry[col] = float(row[col]) if pd.notna(row[col]) else None
            rows.append(entry)

        latest: dict = {}
        for r in reversed(rows):
            us5  = r.get("US_5Y")
            us10 = r.get("US_10Y")
            if us5 is not None and us10 is not None:
                spread = round(us10 - us5, 3)
                latest = {**r, "US_5Y": us5, "US_10Y": us10,
                          "spread": spread, "inverted": spread < 0}
                break

        _COUNTRY_MAP = {
            "US_5Y":        ("United States", "5Y"),
            "US_10Y":       ("United States", "10Y"),
            "India_10Y":    ("India",          "10Y"),
            "Germany_10Y":  ("Germany",        "10Y"),
            "UK_10Y":       ("United Kingdom", "10Y"),
            "Japan_10Y":    ("Japan",          "10Y"),
        }
        countries: dict = {}
        for col, (country, tenor) in _COUNTRY_MAP.items():
            val = latest.get(col)
            if val is not None:
                countries.setdefault(country, {})[tenor] = val

        return {
            "rows":      rows,
            "columns":   available_cols,
            "latest":    latest,
            "countries": countries,
        }

    return await loop.run_in_executor(_data_executor, _fetch)

# ── /api/ticker-info ─────────────────────────────────────────────────────────
@app.get("/api/ticker-info")
async def ticker_info(ticker: str = Query(..., min_length=1)):
    loop = asyncio.get_running_loop()

    def _get_info():
        t    = yf.Ticker(ticker.upper())
        info = t.info
        return {
            "name":     info.get("longName", ticker.upper()),
            "sector":   info.get("sector",   "—"),
            "industry": info.get("industry", "—"),
            "currency": info.get("currency", "USD"),
        }

    return await loop.run_in_executor(_data_executor, _get_info)

# ── /api/health ───────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {
        "status":   "ok",
        "version":  "3.1.1",
        "device":   "cuda" if torch.cuda.is_available() else "cpu",
        "features": len(FEATURE_COLS),
    }
