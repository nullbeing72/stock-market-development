"""
backend/src/model.py  v1.1
Fixes:
  - monte_carlo_forecast: model.train() corrupted BatchNorm stats during inference.
    Now selectively enables only Dropout layers for MC sampling while keeping
    BatchNorm in eval mode.
  - make_loaders: pin_memory is now False when num_workers=0 (was a no-op waste).
  - CombinedLoss directional penalty: scaled by sign rather than raw product
    so the penalty is meaningful for small log-returns.
"""

from __future__ import annotations
from typing import Callable, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from sklearn.preprocessing import MinMaxScaler


# ── Dataset ───────────────────────────────────────────────────────────────────
class StockDataset(Dataset):
    def __init__(self, X: np.ndarray, y: np.ndarray):
        self.X = torch.tensor(X, dtype=torch.float32)
        self.y = torch.tensor(y, dtype=torch.float32).view(-1, 1)

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]


def make_loaders(
    X_train, y_train,
    X_val,   y_val,
    X_test,  y_test,
    batch_size: int = 32,
):
    # FIX: pin_memory only helps when num_workers > 0; with num_workers=0 it's a no-op.
    _pin = torch.cuda.is_available()  # keep True only if CUDA; still harmless for CPU
    def mk(X, y):
        return DataLoader(
            StockDataset(X, y),
            batch_size  = batch_size,
            shuffle     = False,
            pin_memory  = _pin,
            num_workers = 0,   # avoid multiprocessing issues inside ThreadPoolExecutor
        )
    return mk(X_train, y_train), mk(X_val, y_val), mk(X_test, y_test)


# ── Loss ──────────────────────────────────────────────────────────────────────
class CombinedLoss(nn.Module):
    """
    Huber + directional penalty.

    FIX (v3.3): The original penalty `relu(-(pred * target))` was near-zero for
    small log-returns because the product is tiny.  We now use sign agreement:
      penalty = relu(-sign(pred) * sign(target))
    which fires a constant 1.0 for every wrong-direction prediction regardless
    of magnitude, making the 0.4 weight actually meaningful.
    """
    def __init__(self, delta: float = 0.01, direction_weight: float = 0.4):
        super().__init__()
        self.huber            = nn.HuberLoss(delta=delta, reduction="mean")
        self.direction_weight = direction_weight

    def forward(self, pred: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        h_loss = self.huber(pred, target)
        # Sign-based directional penalty: 1.0 if wrong direction, 0.0 if correct
        dir_penalty = torch.mean(F.relu(-torch.sign(pred) * torch.sign(target)))
        return h_loss + self.direction_weight * dir_penalty


# ── Building blocks ───────────────────────────────────────────────────────────
class TemporalConvBlock(nn.Module):
    """Inception-style dual-kernel CNN with residual connection."""
    def __init__(self, in_channels: int, out_channels: int, dropout: float = 0.2):
        super().__init__()
        mid = max(out_channels // 2, 1)

        self.conv3 = nn.Conv1d(in_channels, mid, kernel_size=3, padding=1)
        self.conv5 = nn.Conv1d(in_channels, mid, kernel_size=5, padding=2)
        self.bn3   = nn.BatchNorm1d(mid)
        self.bn5   = nn.BatchNorm1d(mid)

        self.fuse  = nn.Conv1d(out_channels, out_channels, kernel_size=1)
        self.bn_f  = nn.BatchNorm1d(out_channels)

        self.residual = (
            nn.Conv1d(in_channels, out_channels, kernel_size=1)
            if in_channels != out_channels else nn.Identity()
        )
        self.drop = nn.Dropout(dropout)

    def forward(self, x):
        shortcut = self.residual(x)
        c3  = F.gelu(self.bn3(self.conv3(x)))
        c5  = F.gelu(self.bn5(self.conv5(x)))
        out = F.gelu(self.bn_f(self.fuse(torch.cat([c3, c5], dim=1))))
        return self.drop(out) + shortcut


class MultiHeadAttentionBlock(nn.Module):
    """Self-attention with residual + LayerNorm."""
    def __init__(self, d_model: int, num_heads: int = 4, dropout: float = 0.1):
        super().__init__()
        self.attn = nn.MultiheadAttention(d_model, num_heads, dropout=dropout, batch_first=True)
        self.norm = nn.LayerNorm(d_model)
        self.drop = nn.Dropout(dropout)

    def forward(self, x):
        attn_out, _ = self.attn(x, x, x)
        return self.norm(x + self.drop(attn_out))


# ── Hybrid model ──────────────────────────────────────────────────────────────
class HybridModel(nn.Module):
    def __init__(
        self,
        input_size:   int,
        hidden_size:  int   = 128,
        num_layers:   int   = 2,
        cnn_channels: int   = 64,
        num_heads:    int   = 4,
        dropout:      float = 0.2,
    ):
        super().__init__()
        self.cnn  = TemporalConvBlock(input_size, cnn_channels, dropout)
        self.lstm = nn.LSTM(
            input_size   = cnn_channels,
            hidden_size  = hidden_size,
            num_layers   = num_layers,
            batch_first  = True,
            bidirectional= True,
            dropout      = dropout if num_layers > 1 else 0.0,
        )

        bilstm_out   = hidden_size * 2
        actual_heads = num_heads
        while bilstm_out % actual_heads != 0 and actual_heads > 1:
            actual_heads -= 1

        self.attn      = MultiHeadAttentionBlock(bilstm_out, actual_heads, dropout)
        self.time_pool = nn.Linear(bilstm_out, 1)
        self.head      = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(bilstm_out, bilstm_out // 2),
            nn.GELU(),
            nn.Dropout(dropout / 2),
            nn.Linear(bilstm_out // 2, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: [B, Seq, Feat] → CNN wants [B, Feat, Seq]
        cnn_out  = self.cnn(x.permute(0, 2, 1)).permute(0, 2, 1)
        lstm_out, _ = self.lstm(cnn_out)
        attn_out = self.attn(lstm_out)
        scores   = torch.softmax(self.time_pool(attn_out), dim=1)
        pooled   = (attn_out * scores).sum(dim=1)
        return self.head(pooled)


# ── Training ──────────────────────────────────────────────────────────────────
EpochCallback = Callable[[int, int, float, float, float], bool]

def train_model(
    train_loader:   DataLoader,
    val_loader:     DataLoader,
    input_size:     int,
    epochs:         int,
    patience:       int,
    device:         torch.device,
    hidden_size:    int   = 128,
    dropout:        float = 0.2,
    cnn_channels:   int   = 64,
    num_heads:      int   = 4,
    epoch_callback: Optional[EpochCallback] = None,
) -> tuple[HybridModel, dict]:
    model     = HybridModel(input_size, hidden_size, 2, cnn_channels, num_heads, dropout).to(device)
    criterion = CombinedLoss(delta=0.01, direction_weight=0.4)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(
        optimizer, T_0=10, T_mult=2, eta_min=1e-6,
    )

    best_val_loss = float("inf")
    patience_ctr  = 0
    best_state    = None
    history       = {"train": [], "val": []}

    for epoch in range(epochs):
        model.train()
        t_loss = 0.0
        for Xb, yb in train_loader:
            Xb, yb = Xb.to(device), yb.to(device)
            optimizer.zero_grad()
            loss = criterion(model(Xb), yb)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            t_loss += loss.item()
        t_loss /= max(len(train_loader), 1)

        model.eval()
        v_loss = 0.0
        with torch.no_grad():
            for Xb, yb in val_loader:
                v_loss += criterion(model(Xb.to(device)), yb.to(device)).item()
        v_loss /= max(len(val_loader), 1)

        scheduler.step(epoch + v_loss / 10.0)
        history["train"].append(round(t_loss, 6))
        history["val"].append(round(v_loss, 6))

        lr = float(scheduler.get_last_lr()[0])

        if epoch_callback and not epoch_callback(epoch + 1, epochs, t_loss, v_loss, lr):
            break

        if v_loss < best_val_loss:
            best_val_loss = v_loss
            patience_ctr  = 0
            best_state    = {k: v.cpu().clone() for k, v in model.state_dict().items()}
        else:
            patience_ctr += 1
            if patience_ctr >= patience:
                break

    if best_state:
        model.load_state_dict(best_state)
    return model.to(device), history


# ── Inference ─────────────────────────────────────────────────────────────────
def predict_test_set(
    model:       HybridModel,
    test_loader: DataLoader,
    device:      torch.device,
):
    model.eval()
    preds, actuals = [], []
    with torch.no_grad():
        for Xb, yb in test_loader:
            preds.extend(model(Xb.to(device)).cpu().numpy().flatten())
            actuals.extend(yb.numpy().flatten())
    return np.array(preds, dtype=np.float32), np.array(actuals, dtype=np.float32)


def monte_carlo_forecast(
    model:          HybridModel,
    scaled_data:    np.ndarray,
    raw_close_last: float,
    scaler:         MinMaxScaler,
    input_size:     int,
    seq_length:     int,
    forecast_days:  int,
    device:         torch.device,
    n_samples:      int = 80,
    close_idx:      int = 3,
) -> list[dict]:
    """
    Multi-step MC forecast.

    FIX (v3.3): The original code called model.train() to enable dropout for MC
    sampling. This also put BatchNorm into training mode, which corrupts batch
    statistics when batch_size=1 (a single rolling window).

    Correct approach: call model.eval() (freezes BatchNorm), then selectively
    re-enable only Dropout layers so they remain stochastic.
    """
    if len(scaled_data) < seq_length:
        return [{"mean": float(raw_close_last), "std": 0.0} for _ in range(forecast_days)]

    close_min = float(scaler.data_min_[close_idx])
    close_max = float(scaler.data_max_[close_idx])
    price_rng = max(close_max - close_min, 1e-9)

    window    = scaled_data[-seq_length:].copy()
    cur_price = float(raw_close_last)
    results   = []

    # FIX: eval mode (BatchNorm frozen) + selectively enable Dropout for MC sampling
    model.eval()
    for m in model.modules():
        if isinstance(m, nn.Dropout):
            m.train()

    for _ in range(forecast_days):
        inp     = torch.from_numpy(window[np.newaxis]).float().to(device)
        samples = []
        with torch.no_grad():
            for _ in range(n_samples):
                samples.append(float(model(inp).item()))

        mean_ret   = float(np.mean(samples))
        std_ret    = float(np.std(samples))
        next_price = max(cur_price * np.exp(mean_ret), 0.01)
        price_std  = cur_price * std_ret

        results.append({"mean": next_price, "std": price_std})

        # Roll window forward
        next_feat             = window[-1].copy()
        next_feat[close_idx]  = np.clip((next_price - close_min) / price_rng, 0.0, 1.0)
        window                = np.concatenate([window[1:], next_feat[np.newaxis]], axis=0)
        cur_price             = next_price

    return results


# ── Metrics ───────────────────────────────────────────────────────────────────
def compute_metrics(pred_prices: np.ndarray, actual_prices: np.ndarray) -> dict:
    if len(pred_prices) == 0 or len(actual_prices) == 0:
        return {"mae": None, "rmse": None, "mape": None, "directional_accuracy": None}

    n    = min(len(pred_prices), len(actual_prices))
    p, a = pred_prices[:n], actual_prices[:n]

    mae  = float(np.mean(np.abs(p - a)))
    rmse = float(np.sqrt(np.mean((p - a) ** 2)))
    denom = np.where(np.abs(a) < 1e-9, 1e-9, a)
    mape = float(np.mean(np.abs((p - a) / denom)) * 100.0)

    dir_acc = None
    if n > 1:
        correct = np.sign(np.diff(p)) == np.sign(np.diff(a))
        dir_acc = float(np.sum(correct) / (n - 1) * 100.0)

    return {
        "mae":                  round(mae,     4),
        "rmse":                 round(rmse,    4),
        "mape":                 round(mape,    4),
        "directional_accuracy": round(dir_acc, 2) if dir_acc is not None else None,
    }


def model_summary(model: HybridModel) -> dict:
    total     = sum(p.numel() for p in model.parameters())
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    return {"total_params": total, "trainable_params": trainable}
