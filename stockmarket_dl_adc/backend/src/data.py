"""
backend/src/data.py — v4.0.0
Changes from v1.1:
  - Removed: _fuzzy_cmeans, compute_fcm_risk, _fcm_fallback
  - Added:   compute_adc_risk — Autoencoder Deep Clustering risk analysis
             Uses an IDEC-style approach (AE pre-train → k-Means init →
             joint reconstruction + KL-divergence clustering loss) over all
             31 engineered features.  Returns the same output schema as the
             former FCM function so the rest of the pipeline is unchanged.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.preprocessing import MinMaxScaler

# ── Feature column registry ───────────────────────────────────────────────────
PRICE_FEATURE_COLS: list[str] = [
    "Open", "High", "Low", "Close", "Volume",
    "SMA_10", "SMA_50", "MACD", "MACD_Signal",
    "RSI", "ROC_10", "Stoch_K",
    "BB_Upper", "BB_Lower", "ATR",
    "OBV_norm", "RVI",
]

FACTOR_FEATURE_COLS: list[str] = [
    "Beta_60", "Alpha_60", "Momentum_12_1", "Sharpe_60", "Vol_Ratio", "Mkt_Return",
    "Bond_5Y", "Bond_10Y",
    "Gold", "Silver", "Copper", "Aluminium", "Brent_Oil",
    "Buffett_Proxy",
]

FEATURE_COLS      = PRICE_FEATURE_COLS + FACTOR_FEATURE_COLS
CLOSE_IDX         = PRICE_FEATURE_COLS.index("Close")   # 3
N_PRICE_FEATURES  = len(PRICE_FEATURE_COLS)
N_FACTOR_FEATURES = len(FACTOR_FEATURE_COLS)

_GDP_ETFS: dict[str, str] = {
    "US":     "SPY",
    "India":  "INDA",
    "China":  "FXI",
    "EU":     "EZU",
    "Japan":  "EWJ",
    "UK":     "EWU",
    "Brazil": "EWZ",
}

_COMMODITY_TICKERS: dict[str, str] = {
    "Gold":      "GC=F",
    "Silver":    "SI=F",
    "Copper":    "HG=F",
    "Aluminium": "ALI=F",
    "Brent_Oil": "BZ=F",
}

# ── In-memory cache ───────────────────────────────────────────────────────────
_CACHE: dict[str, tuple[float, object]] = {}
_TTL   = 3600.0

def _cache_get(key: str):
    entry = _CACHE.get(key)
    if entry and (time.time() - entry[0]) < _TTL:
        return entry[1]
    return None

def _cache_set(key: str, value):
    _CACHE[key] = (time.time(), value)
    return value

# ── Robust yfinance column normalizer ─────────────────────────────────────────
def _normalize_columns(df: pd.DataFrame, tickers: list[str] | None = None) -> pd.DataFrame:
    """
    Flatten MultiIndex columns produced by yf.download().

    BUG FIX (v3.3): For single-ticker downloads yfinance ≥0.2 still produces a
    MultiIndex with (field, ticker) at levels (0, 1). Taking get_level_values(0)
    then produces *duplicate* column names (e.g., two "Close" columns) because
    level-0 repeats across tickers.  We now always use the ticker symbol (level 1)
    as the discriminator when tickers is provided, and for single-ticker calls we
    explicitly drop the ticker level via xs() or droplevel().

    When tickers is None  → returns OHLCV DataFrame for a single ticker.
    When tickers is given → returns DataFrame with those tickers as columns
                            (each column = Close price for that ticker).
    """
    if df is None or df.empty:
        return df

    if not isinstance(df.columns, pd.MultiIndex):
        if "Adj Close" in df.columns and "Close" not in df.columns:
            df = df.rename(columns={"Adj Close": "Close"})
        return df

    level_0 = list(df.columns.get_level_values(0).unique())
    level_1 = list(df.columns.get_level_values(1).unique())

    if tickers is not None:
        # Multi-ticker: caller wants per-ticker Close prices.
        close_field = (
            "Close"     if "Close"     in level_0 else
            "Adj Close" if "Adj Close" in level_0 else None
        )
        if close_field:
            try:
                result = df[close_field]
                # result is a DataFrame with tickers as columns
                return result
            except Exception:
                pass
        # Fallback: flatten and pick ticker-named columns
        df.columns = [
            str(col[1]) if col[1] else str(col[0])
            for col in df.columns
        ]
        return df

    # Single-ticker multi-index — FIX: use level-1 (ticker symbol) to drop
    # the ticker dimension, leaving only field names as the column index.
    try:
        # level_1 contains the single ticker name; drop it.
        if len(level_1) == 1:
            df = df.droplevel(1, axis=1)
        else:
            # Unexpected: multiple tickers but tickers=None. Use level-0.
            df.columns = df.columns.get_level_values(0)
    except Exception:
        df.columns = ["_".join(str(c) for c in col).strip("_") for col in df.columns]

    if "Adj Close" in df.columns and "Close" not in df.columns:
        df = df.rename(columns={"Adj Close": "Close"})

    return df

# ── Data fetching ─────────────────────────────────────────────────────────────
def fetch_data(ticker: str, period_days: int) -> Optional[pd.DataFrame]:
    key = f"price:{ticker}:{period_days}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        end   = datetime.today()
        start = end - timedelta(days=period_days + 100)
        df = yf.download(ticker, start=start, end=end, progress=False, auto_adjust=True)
        if df.empty:
            return None
        df = _normalize_columns(df)
        df = df[["Open", "High", "Low", "Close", "Volume"]].dropna()
        df = df.asfreq("B").ffill()
        return _cache_set(key, df)
    except Exception as e:
        print(f"[fetch_data] {e}")
        return None

def fetch_market_data(period_days: int, ticker: str = "SPY") -> Optional[pd.DataFrame]:
    key = f"market:{ticker}:{period_days}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        end   = datetime.today()
        start = end - timedelta(days=period_days + 400)
        df = yf.download(ticker, start=start, end=end, progress=False, auto_adjust=True)
        if df.empty:
            return None
        df = _normalize_columns(df)
        df = df.dropna().asfreq("B").ffill()
        return _cache_set(key, df)
    except Exception as e:
        print(f"[fetch_market_data] {e}")
        return None


# ── Global bond yield sources ─────────────────────────────────────────────────
_YAHOO_BOND_TICKERS: dict[str, str] = {
    "US_5Y":  "^FVX",
    "US_10Y": "^TNX",
}

_ETF_YIELD_PROXIES: dict[str, dict] = {
    "India_10Y":   {"etf": "INDA", "anchor": 6.80, "sensitivity": 0.30},
    "Germany_10Y": {"etf": "EZU",  "anchor": 2.45, "sensitivity": 0.70},
    "UK_10Y":      {"etf": "EWU",  "anchor": 4.40, "sensitivity": 0.85},
    "Japan_10Y":   {"etf": "EWJ",  "anchor": 1.10, "sensitivity": 0.10},
}

_YIELD_MIN, _YIELD_MAX = 0.01, 20.0

def _validate_yield_series(s: pd.Series) -> bool:
    if s is None or len(s) < 5:
        return False
    return _YIELD_MIN <= float(s.median()) <= _YIELD_MAX

def _fetch_yahoo_yield(ticker: str, start, end) -> Optional[pd.Series]:
    try:
        raw = yf.download(ticker, start=start, end=end, progress=False, auto_adjust=True)
        if raw is None or raw.empty:
            return None
        raw = _normalize_columns(raw)
        for col in ("Close", "Adj Close"):
            if col in raw.columns:
                s = pd.to_numeric(raw[col], errors="coerce").dropna()
                if _validate_yield_series(s):
                    return s
        return None
    except Exception as e:
        print(f"[_fetch_yahoo_yield] {ticker}: {e}")
        return None

def _build_synthetic_yield(
    etf: str,
    anchor: float,
    sensitivity: float,
    us10y_series: Optional[pd.Series],
    start, end,
) -> pd.Series:
    try:
        raw = yf.download(etf, start=start, end=end, progress=False, auto_adjust=True)
        if raw is None or raw.empty:
            raise ValueError("empty ETF download")
        raw = _normalize_columns(raw)
        if "Close" not in raw.columns:
            raise ValueError("no Close column")

        prices    = raw["Close"].dropna()
        log_ret   = np.log(prices / prices.shift(1)).dropna()
        cum_drift = log_ret.rolling(20).mean().cumsum().fillna(0)

        rng = cum_drift.max() - cum_drift.min()
        normalised = ((cum_drift - cum_drift.mean()) / rng) if rng > 1e-6 else cum_drift * 0

        if us10y_series is not None:
            us_aligned = us10y_series.reindex(normalised.index, method="ffill").bfill()
            us_delta   = (us_aligned - float(us_aligned.mean())).fillna(0)
            yield_s    = anchor + normalised * 0.5 + us_delta * sensitivity
        else:
            yield_s = anchor + normalised * 0.5

        yield_s = yield_s.clip(_YIELD_MIN, _YIELD_MAX)
        yield_s = yield_s[(yield_s.index >= pd.Timestamp(start)) &
                          (yield_s.index <= pd.Timestamp(end))]
        if len(yield_s) < 5:
            raise ValueError("too short after filtering")

        return yield_s

    except Exception as e:
        print(f"[bond_proxy] {etf}: {e} — using flat anchor {anchor}%")
        bday_range = pd.bdate_range(start=start, end=end)
        rng_obj    = np.random.default_rng(42)
        noise      = rng_obj.normal(0, 0.04, len(bday_range))
        return pd.Series(
            np.clip(anchor + noise, _YIELD_MIN, _YIELD_MAX), index=bday_range
        )

def fetch_bond_yields(period_days: int) -> Optional[pd.DataFrame]:
    key = f"bonds_v4:{period_days}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        end   = datetime.today()
        start = end - timedelta(days=period_days + 50)
        frames: dict[str, pd.Series] = {}

        for col_name, ticker in _YAHOO_BOND_TICKERS.items():
            s = _fetch_yahoo_yield(ticker, start, end)
            if s is not None:
                frames[col_name] = s
            else:
                print(f"[fetch_bond_yields] {col_name}: Yahoo failed")

        us10y = frames.get("US_10Y")
        for col_name, cfg in _ETF_YIELD_PROXIES.items():
            s = _build_synthetic_yield(
                etf=cfg["etf"], anchor=cfg["anchor"],
                sensitivity=cfg["sensitivity"],
                us10y_series=us10y, start=start, end=end,
            )
            frames[col_name] = s

        if not frames:
            return None

        bonds = pd.DataFrame(frames)
        bonds = bonds.sort_index().asfreq("B").ffill().bfill()
        bonds = bonds.dropna(how="all")
        return _cache_set(key, bonds)
    except Exception as e:
        print(f"[fetch_bond_yields] {e}")
        return None

def fetch_commodities(period_days: int) -> Optional[pd.DataFrame]:
    key = f"comm:{period_days}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        end     = datetime.today()
        start   = end - timedelta(days=period_days + 50)
        tickers = list(_COMMODITY_TICKERS.values())
        names   = list(_COMMODITY_TICKERS.keys())

        raw = yf.download(tickers, start=start, end=end, progress=False, auto_adjust=True)
        if raw.empty:
            return None

        close_df = _normalize_columns(raw, tickers=tickers)
        data = pd.DataFrame(index=close_df.index)

        for tkr, name in zip(tickers, names):
            if tkr in close_df.columns:
                data[name] = close_df[tkr]

        data = data.asfreq("B").ffill().dropna(how="all")
        return _cache_set(key, data)
    except Exception as e:
        print(f"[fetch_commodities] {e}")
        return None

# ── Feature engineering ───────────────────────────────────────────────────────
def add_technical_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    df["SMA_10"] = df["Close"].rolling(10).mean()
    df["SMA_50"] = df["Close"].rolling(50).mean()

    ema12         = df["Close"].ewm(span=12, adjust=False).mean()
    ema26         = df["Close"].ewm(span=26, adjust=False).mean()
    df["MACD"]    = ema12 - ema26
    df["MACD_Signal"] = df["MACD"].ewm(span=9, adjust=False).mean()

    delta  = df["Close"].diff()
    gain   = delta.where(delta > 0, 0.0).rolling(14).mean()
    loss   = (-delta.where(delta < 0, 0.0)).rolling(14).mean()
    rs     = gain / loss.replace(0, np.nan)
    df["RSI"] = (100.0 - (100.0 / (1.0 + rs))).fillna(50.0)

    df["ROC_10"]  = df["Close"].pct_change(10) * 100.0
    low14, high14 = df["Low"].rolling(14).min(), df["High"].rolling(14).max()
    df["Stoch_K"] = 100.0 * (df["Close"] - low14) / (high14 - low14).replace(0.0, np.nan)

    sma20, std20    = df["Close"].rolling(20).mean(), df["Close"].rolling(20).std()
    df["BB_Upper"]  = sma20 + 2.0 * std20
    df["BB_Lower"]  = sma20 - 2.0 * std20

    tr = pd.concat([
        df["High"] - df["Low"],
        (df["High"] - df["Close"].shift(1)).abs(),
        (df["Low"]  - df["Close"].shift(1)).abs(),
    ], axis=1).max(axis=1)
    df["ATR"] = tr.rolling(14).mean()

    direction     = np.sign(df["Close"].diff()).fillna(0.0)
    obv           = (direction * df["Volume"]).cumsum()
    obv_std       = obv.rolling(20).std().replace(0.0, np.nan)
    df["OBV_norm"] = (obv - obv.rolling(20).mean()) / obv_std

    d_vol         = (df["High"] - df["Low"]).diff()
    g_vol         = d_vol.where(d_vol > 0, 0.0).rolling(14).mean()
    l_vol         = (-d_vol.where(d_vol < 0, 0.0)).rolling(14).mean()
    df["RVI"]     = 100.0 - (100.0 / (1.0 + (g_vol / l_vol.replace(0, np.nan))))

    return df

def add_quant_features(
    df: pd.DataFrame,
    market_df: pd.DataFrame,
    bond_df: Optional[pd.DataFrame] = None,
    comm_df: Optional[pd.DataFrame] = None,
) -> pd.DataFrame:
    df        = df.copy()
    mkt_close = market_df["Close"].reindex(df.index, method="ffill")
    stock_ret = np.log(df["Close"] / df["Close"].shift(1))
    mkt_ret   = np.log(mkt_close  / mkt_close.shift(1))
    df["Mkt_Return"] = mkt_ret

    WINDOW = 60
    betas  = np.full(len(df), np.nan)
    alphas = np.full(len(df), np.nan)
    sr, mr = stock_ret.values, mkt_ret.values

    for i in range(WINDOW, len(df)):
        y, x = sr[i - WINDOW:i], mr[i - WINDOW:i]
        mask  = ~(np.isnan(x) | np.isnan(y))
        if mask.sum() > 20:
            xf, yf = x[mask], y[mask]
            cov    = np.cov(xf, yf)[0, 1]
            var    = np.var(xf)
            if var > 1e-9:
                beta       = cov / var
                betas[i]   = beta
                alphas[i]  = (yf.mean() - beta * xf.mean()) * 252

    df["Beta_60"]       = betas
    df["Alpha_60"]      = alphas
    df["Momentum_12_1"] = (df["Close"].pct_change(252) - df["Close"].pct_change(21)) * 100.0
    df["Sharpe_60"]     = (
        stock_ret.rolling(WINDOW).mean()
        / stock_ret.rolling(WINDOW).std().replace(0, np.nan)
    ) * np.sqrt(252)
    df["Vol_Ratio"] = (
        stock_ret.rolling(10).std()
        / stock_ret.rolling(WINDOW).std().replace(0, np.nan)
    )

    # Bond yields — rename US_5Y/US_10Y → Bond_5Y/Bond_10Y for FEATURE_COLS
    _BOND_COL_MAP = {"US_5Y": "Bond_5Y", "US_10Y": "Bond_10Y"}
    if bond_df is not None and not bond_df.empty:
        aligned_bonds = bond_df.reindex(df.index, method="ffill")
        for src_col, dst_col in _BOND_COL_MAP.items():
            df[dst_col] = aligned_bonds[src_col] if src_col in aligned_bonds.columns else np.nan
    else:
        df["Bond_5Y"]  = np.nan
        df["Bond_10Y"] = np.nan

    # Commodities
    if comm_df is not None and not comm_df.empty:
        aligned_comm = comm_df.reindex(df.index, method="ffill")
        for col in list(_COMMODITY_TICKERS.keys()):
            df[col] = aligned_comm[col] if col in aligned_comm.columns else np.nan
    else:
        for col in list(_COMMODITY_TICKERS.keys()):
            df[col] = np.nan

    spy_sma = mkt_close.rolling(252).mean().replace(0, np.nan)
    df["Buffett_Proxy"] = (mkt_close / spy_sma) * 100.0

    return df

# ── Forecasting logic ─────────────────────────────────────────────────────────
def _holt_forecast(series: np.ndarray, alpha: float = 0.3, beta: float = 0.1, steps: int = 30):
    """
    Holt's Linear (Double) Exponential Smoothing.

    BUG FIX (v3.3): Trend was initialised as s[1]-s[0] (noisy single-step).
    Now uses global slope (s[-1]-s[0])/(n-1) per standard Holt initialisation.
    """
    s = series[~np.isnan(series)]
    if len(s) < 5:
        val = s[-1] if len(s) else 0.0
        return np.full(steps, val), np.zeros(steps)

    level = float(s[0])
    # FIX: global slope initialisation instead of s[1]-s[0]
    trend = float((s[-1] - s[0]) / (len(s) - 1)) if len(s) > 1 else 0.0

    for t in range(1, len(s)):
        last_l = level
        level  = alpha * s[t] + (1 - alpha) * (level + trend)
        trend  = beta  * (level - last_l) + (1 - beta) * trend

    fcast          = level + np.arange(1, steps + 1) * trend
    residue_sigma  = np.std(np.diff(s))
    bands          = residue_sigma * np.sqrt(np.arange(1, steps + 1))
    return fcast, bands

def forecast_commodity_prices(period_days: int = 730, forecast_days: int = 10) -> dict:
    key = f"comm_fcst:{period_days}:{forecast_days}"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    results: dict = {}
    for name, ticker in _COMMODITY_TICKERS.items():
        try:
            raw = yf.download(ticker, period="2y", progress=False, auto_adjust=True)
            if raw.empty:
                continue
            raw    = _normalize_columns(raw)
            prices = raw["Close"].dropna().values
            means, sigma = _holt_forecast(prices, steps=forecast_days)
            results[name] = {
                "last_price":     float(prices[-1]),
                "means":          means.tolist(),
                "upper":          (means + sigma).tolist(),
                "lower":          (means - sigma).tolist(),
                "pct_change_1d":  round(((means[0] - prices[-1]) / prices[-1]) * 100, 2),
                "dates": [
                    str((datetime.today() + timedelta(days=i)).date())
                    for i in range(1, forecast_days + 1)
                ],
                "alpha": 0.3,
                "beta":  0.1,
            }
        except Exception as e:
            print(f"[forecast_commodity_prices] {name}: {e}")

    return _cache_set(key, results)

def forecast_gdp_growth(period_days: int = 730, forecast_days: int = 30) -> dict:
    """
    Uses annualised 252-day ETF return as a GDP growth proxy, then applies
    Holt smoothing to produce a forecast with ±1σ bands.
    Falls back to consensus estimates when ETF data is unavailable.
    """
    consensus = {
        "US": 2.5, "India": 6.8, "China": 4.8,
        "EU": 1.2, "Japan": 1.0, "UK": 0.8, "Brazil": 2.2,
    }
    results: dict = {}

    for country, etf in _GDP_ETFS.items():
        base_rate = consensus[country]
        try:
            end   = datetime.today()
            start = end - timedelta(days=period_days + 50)
            raw   = yf.download(etf, start=start, end=end, progress=False, auto_adjust=True)
            if raw.empty:
                raise ValueError("empty")
            raw    = _normalize_columns(raw)
            prices = raw["Close"].dropna()

            annual_ret = (prices / prices.shift(252) - 1) * 100.0
            annual_ret = annual_ret.dropna()

            if len(annual_ret) < 30:
                raise ValueError("insufficient return history")

            current_pct = float(annual_ret.iloc[-1])
            fcst, sigma = _holt_forecast(annual_ret.values, steps=forecast_days)

            results[country] = {
                "current_annual_pct": current_pct,
                "forecast_pct":       fcst.tolist(),
                "upper_pct":          (fcst + sigma).tolist(),
                "lower_pct":          (fcst - sigma).tolist(),
                "source":             f"{etf} ETF Proxy",
            }
        except Exception:
            _rng  = np.random.default_rng(abs(hash(country)) % (2**31))
            drift = np.linspace(base_rate, base_rate + _rng.uniform(-0.2, 0.2), forecast_days)
            results[country] = {
                "current_annual_pct": base_rate,
                "forecast_pct":       drift.tolist(),
                "upper_pct":          (drift + 0.3).tolist(),
                "lower_pct":          (drift - 0.3).tolist(),
                "source":             "Consensus Estimate",
            }

    return results

def compute_macro_correlations(df: pd.DataFrame) -> pd.DataFrame:
    cols = [
        "Close", "Bond_10Y", "Gold", "Brent_Oil",
        "Buffett_Proxy", "RSI", "Beta_60", "MACD",
        "Silver", "Copper",
    ]
    available = [c for c in cols if c in df.columns]
    if len(available) < 2:
        return pd.DataFrame()
    corr = df[available].dropna().corr()[["Close"]].drop("Close")
    corr.columns = ["correlation"]
    return corr.sort_values("correlation", ascending=False)

# ── ML helpers ────────────────────────────────────────────────────────────────
def build_sequences(scaled_data: np.ndarray, raw_close: np.ndarray, seq_length: int):
    """Predict log-returns — more stationary than raw prices."""
    log_returns = np.log(raw_close[1:] / np.where(raw_close[:-1] == 0, 1e-9, raw_close[:-1]))
    X, y = [], []
    for i in range(seq_length, len(scaled_data)):
        X.append(scaled_data[i - seq_length:i])
        y.append(log_returns[i - 1])
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)

def split_data(X, y, train_ratio: float = 0.7, val_ratio: float = 0.15):
    n         = len(X)
    train_end = int(n * train_ratio)
    val_end   = int(n * (train_ratio + val_ratio))
    return (
        (X[:train_end],   y[:train_end]),
        (X[train_end:val_end], y[train_end:val_end]),
        (X[val_end:],     y[val_end:]),
        val_end,
        train_end,
    )

def returns_to_prices(log_returns: np.ndarray, start_price: float) -> np.ndarray:
    """Convert log-return sequence back to a price series."""
    prices = np.empty(len(log_returns))
    price  = start_price
    for i, r in enumerate(log_returns):
        price     = price * np.exp(r)
        prices[i] = price
    return prices


# ── Autoencoder Deep Clustering (IDEC-style) ─────────────────────────────────

import torch as _torch
import torch.nn as _nn
import torch.nn.functional as _F
from sklearn.preprocessing import MinMaxScaler as _MinMaxScaler
from sklearn.cluster import KMeans as _KMeans


def _build_adc_features(df: "pd.DataFrame"):
    """
    Build a clean (n_samples, n_features) float32 matrix from the full
    31-column feature DataFrame.  Returns None when there are too few rows.
    """
    try:
        available = [c for c in FEATURE_COLS if c in df.columns]
        mat = df[available].copy().ffill().bfill().fillna(0.0).values.astype("float32")
        # Drop rows that are entirely zero (padding artefacts)
        row_nonzero = np.abs(mat).sum(axis=1) > 1e-9
        mat = mat[row_nonzero]
        if len(mat) < 30:
            return None, None
        idx_keep = np.where(row_nonzero)[0]
        return mat, idx_keep
    except Exception:
        return None, None


# ── Autoencoder (tied encoder/decoder) ───────────────────────────────────────
class _Autoencoder(_nn.Module):
    """
    Symmetric fully-connected autoencoder.
    Encoder: input_dim → 256 → 128 → 64 → latent_dim
    Decoder: latent_dim → 64 → 128 → 256 → input_dim
    Uses BatchNorm + GELU throughout (except the output layer).
    """

    def __init__(self, input_dim: int, latent_dim: int = 10):
        super().__init__()
        dims = [input_dim, 256, 128, 64, latent_dim]
        enc_layers: list[_nn.Module] = []
        for i in range(len(dims) - 1):
            enc_layers.append(_nn.Linear(dims[i], dims[i + 1]))
            if i < len(dims) - 2:
                enc_layers.append(_nn.BatchNorm1d(dims[i + 1]))
                enc_layers.append(_nn.GELU())
        self.encoder = _nn.Sequential(*enc_layers)

        dec_dims = list(reversed(dims))
        dec_layers: list[_nn.Module] = []
        for i in range(len(dec_dims) - 1):
            dec_layers.append(_nn.Linear(dec_dims[i], dec_dims[i + 1]))
            if i < len(dec_dims) - 2:
                dec_layers.append(_nn.BatchNorm1d(dec_dims[i + 1]))
                dec_layers.append(_nn.GELU())
        self.decoder = _nn.Sequential(*dec_layers)

    def encode(self, x: "_torch.Tensor") -> "_torch.Tensor":
        return self.encoder(x)

    def decode(self, z: "_torch.Tensor") -> "_torch.Tensor":
        return self.decoder(z)

    def forward(self, x: "_torch.Tensor"):
        z = self.encode(x)
        return z, self.decode(z)


# ── Student-t soft cluster assignment (DEC / IDEC) ────────────────────────────
def _soft_assignment(
    z: "_torch.Tensor",
    centers: "_torch.Tensor",
    alpha: float = 1.0,
) -> "_torch.Tensor":
    """
    q_{ij} = (1 + ||z_i - mu_j||^2 / alpha)^{-(alpha+1)/2}
             normalised over j.
    """
    dist = _torch.cdist(z, centers) ** 2          # (N, k)
    q = (1.0 + dist / alpha) ** (-(alpha + 1.0) / 2.0)
    return q / q.sum(dim=1, keepdim=True)


def _target_distribution(q: "_torch.Tensor") -> "_torch.Tensor":
    """
    p_{ij} = (q_{ij}^2 / f_j) / sum_j (q_{ij}^2 / f_j)
    where f_j = sum_i q_{ij}.  Sharpens high-confidence assignments.
    """
    f = q.sum(dim=0, keepdim=True)           # (1, k)
    p = (q ** 2) / f
    return p / p.sum(dim=1, keepdim=True)


# ── Full IDEC training loop ────────────────────────────────────────────────────
def _train_idec(
    X_scaled: np.ndarray,
    n_clusters: int = 4,
    latent_dim: int = 10,
    pretrain_epochs: int = 60,
    cluster_epochs: int = 80,
    batch_size: int = 64,
    lr_pretrain: float = 1e-3,
    lr_cluster: float = 5e-4,
    lambda_rec: float = 0.1,
    device_str: str = "cpu",
    seed: int = 42,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    IDEC (Improved Deep Embedded Clustering) training.

    Phase 1 — Pre-train AE with MSE reconstruction loss only.
    Phase 2 — k-Means initialisation of cluster centres in latent space.
    Phase 3 — Joint optimisation:
                  L_total = lambda_rec * L_rec  +  (1 - lambda_rec) * KL(P || Q)
               where P is the target distribution and Q is the soft assignment.
               Both the AE parameters *and* the cluster centres are updated
               simultaneously (simultaneous DC in the survey's taxonomy).

    Returns
    -------
    embeddings  : (n_samples, latent_dim)
    soft_assign : (n_samples, n_clusters)   — Q matrix after training
    hard_labels : (n_samples,)              — argmax cluster assignments
    """
    _torch.manual_seed(seed)
    np.random.seed(seed)
    device = _torch.device(device_str)

    n, d = X_scaled.shape
    X_t  = _torch.tensor(X_scaled, dtype=_torch.float32)

    model = _Autoencoder(input_dim=d, latent_dim=latent_dim).to(device)
    opt_pre = _torch.optim.Adam(model.parameters(), lr=lr_pretrain, weight_decay=1e-5)

    # ── Phase 1: AE pre-training ──────────────────────────────────────────────
    model.train()
    for _ in range(pretrain_epochs):
        perm = _torch.randperm(n)
        for start in range(0, n, batch_size):
            idx = perm[start:start + batch_size]
            xb  = X_t[idx].to(device)
            _, xb_hat = model(xb)
            loss = _F.mse_loss(xb_hat, xb)
            opt_pre.zero_grad()
            loss.backward()
            opt_pre.step()

    # ── Phase 2: k-Means init ────────────────────────────────────────────────
    model.eval()
    with _torch.no_grad():
        Z_all = model.encode(X_t.to(device)).cpu().numpy()

    km = _KMeans(n_clusters=n_clusters, n_init=20, random_state=seed)
    km.fit(Z_all)
    centers = _torch.tensor(km.cluster_centers_, dtype=_torch.float32).to(device)
    centers = _nn.Parameter(centers)   # make centres learnable

    opt_clust = _torch.optim.Adam(
        list(model.parameters()) + [centers],
        lr=lr_cluster, weight_decay=1e-5,
    )

    # ── Phase 3: Joint IDEC optimisation ────────────────────────────────────
    model.train()
    for ep in range(cluster_epochs):
        # Recompute target distribution every 5 epochs (standard IDEC schedule)
        if ep % 5 == 0:
            model.eval()
            with _torch.no_grad():
                Z_all = model.encode(X_t.to(device))
                Q_all = _soft_assignment(Z_all, centers)
                P_all = _target_distribution(Q_all).detach()
            model.train()

        perm = _torch.randperm(n)
        for start in range(0, n, batch_size):
            idx  = perm[start:start + batch_size]
            xb   = X_t[idx].to(device)
            pb   = P_all[idx]

            z, xb_hat = model(xb)
            q          = _soft_assignment(z, centers)

            rec_loss  = _F.mse_loss(xb_hat, xb)
            kl_loss   = _F.kl_div(q.log(), pb, reduction="batchmean")
            total     = lambda_rec * rec_loss + (1.0 - lambda_rec) * kl_loss

            opt_clust.zero_grad()
            total.backward()
            _torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt_clust.step()

    # ── Final embeddings & assignments ───────────────────────────────────────
    model.eval()
    with _torch.no_grad():
        Z_final = model.encode(X_t.to(device))
        Q_final = _soft_assignment(Z_final, centers).cpu().numpy()

    Z_final = Z_final.cpu().numpy()
    labels  = Q_final.argmax(axis=1)
    return Z_final, Q_final, labels


# ── Public entry point ────────────────────────────────────────────────────────
def compute_adc_risk(df: "pd.DataFrame") -> dict:
    """
    Autoencoder Deep Clustering (IDEC-style) risk analysis.

    Methodology
    -----------
    1. Build a feature matrix from all 31 engineered columns (the same set
       used for the price-prediction model) — no manual feature selection.
    2. Normalise to [0, 1] with MinMaxScaler.
    3. Train an IDEC model with k=4 clusters:
         Phase 1 — Autoencoder pre-training (MSE reconstruction loss).
         Phase 2 — k-Means initialisation of cluster centres in latent space.
         Phase 3 — Joint optimisation:
                      L = lambda_rec * L_rec + (1-lambda_rec) * KL(P||Q)
                   where P is the sharpened target distribution and Q is the
                   Student-t soft assignment (DEC formulation).
    4. Identify the "high-risk" cluster by the highest mean 21-day
       annualised volatility among all cluster centres.
    5. Each trading day's high-risk soft membership is its Q value for that
       cluster.  Year-wise means and the current score are reported.

    Output schema is identical to the former FCM output so the frontend
    requires no structural changes.
    """
    try:
        mat, row_idx = _build_adc_features(df)
        if mat is None or len(mat) < 30:
            return _adc_fallback(error="insufficient clean feature rows (need ≥30)")

        # Normalise
        scaler   = _MinMaxScaler()
        X_scaled = scaler.fit_transform(mat).astype("float32")

        # Adaptive latent dimension — at most 10, at least 4
        latent_dim  = min(10, max(4, X_scaled.shape[1] // 4))
        # Fewer epochs on small datasets to keep it fast
        n           = len(X_scaled)
        pre_ep  = min(60, max(20, n // 10))
        clus_ep = min(80, max(30, n // 8))

        embeddings, Q, labels = _train_idec(
            X_scaled,
            n_clusters      = 4,
            latent_dim      = latent_dim,
            pretrain_epochs = pre_ep,
            cluster_epochs  = clus_ep,
            batch_size      = min(128, max(16, n // 8)),
            seed            = 42,
        )

        if np.isnan(Q).any() or np.isnan(embeddings).any():
            return _adc_fallback(error="IDEC produced NaN — degenerate feature data")

        # ── Identify high-risk cluster by volatility ───────────────────────
        close   = df["Close"].dropna()
        log_ret = np.log(close / close.shift(1)).dropna()
        vol_21  = (log_ret.rolling(21).std() * np.sqrt(252)).dropna()

        # Align vol series to the rows we kept
        df_vol = pd.Series(np.nan, index=df.index)
        df_vol.loc[vol_21.index] = vol_21.values
        vol_aligned = df_vol.iloc[row_idx].values.astype("float32")

        cluster_mean_vol = np.array([
            np.nanmean(vol_aligned[labels == k]) if (labels == k).any() else 0.0
            for k in range(4)
        ])
        high_risk_idx = int(np.argmax(cluster_mean_vol))

        # Soft membership in the high-risk cluster for each row
        high_risk_membership = Q[:, high_risk_idx]

        # Rebuild a date-indexed Series using original df index
        date_index = df.index[row_idx]
        membership = pd.Series(high_risk_membership, index=date_index)

        # Year-wise means
        yearly = (
            membership
            .groupby(membership.index.year)
            .mean()
            .round(4)
            .to_dict()
        )

        overall_mean  = float(np.mean(list(yearly.values())))
        current_score = float(membership.iloc[-1])

        risk_label = (
            "High Risk"     if current_score >= 0.65 else
            "Moderate Risk" if current_score >= 0.40 else
            "Low Risk"
        )

        # Report mean annualised volatility (%) at each cluster centre
        centre_vols = [
            round(float(cluster_mean_vol[k]) * 100, 2)
            for k in range(4)
        ]

        return {
            "yearly":               {str(k): round(v, 4) for k, v in yearly.items()},
            "overall_mean":         round(overall_mean, 4),
            "current_score":        round(current_score, 4),
            "risk_label":           risk_label,
            "cluster_centers":      centre_vols,       # 4 values now
            "high_risk_centre_idx": high_risk_idx,
            "n_clusters":           4,
            "latent_dim":           latent_dim,
            "error":                "",
        }

    except Exception as exc:
        import traceback as _tb
        print(f"[compute_adc_risk] FAILED — {type(exc).__name__}: {exc}")
        print(_tb.format_exc())
        return _adc_fallback(error=str(exc))


def _adc_fallback(error: str = "") -> dict:
    return {
        "yearly":               {},
        "overall_mean":         None,
        "current_score":        None,
        "risk_label":           "Unavailable",
        "cluster_centers":      [],
        "high_risk_centre_idx": 0,
        "n_clusters":           4,
        "latent_dim":           10,
        "error":                error,
    }
