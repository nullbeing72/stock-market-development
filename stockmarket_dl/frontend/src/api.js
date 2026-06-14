/**
 * api.js — Ticker-Teller Frontend API v1.0
 */

const BASE = '/api';

/** Wrap fetch with a timeout. Throws DOMException('AbortError') on timeout. */
function fetchWithTimeout(url, options = {}, timeoutMs = 30_000) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

/**
 * Stream a POST request for stock analysis as Server-Sent Events (SSE).
 * @param {Object} config  - Model configuration (ticker, epochs, etc.)
 * @param {Function} onEvent - Callback for parsed JSON events
 * @returns {Function} - Call to abort the stream
 */
export function streamAnalyze(config, onEvent) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE}/analyze`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(config),
        signal:  controller.signal,
      });

      if (!res.ok) {
        onEvent({ type: 'error', message: `HTTP ${res.status}: ${res.statusText}` });
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by double newlines
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';   // keep incomplete trailing frame

        for (const part of parts) {
          for (const line of part.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) {
              try {
                const dataStr = trimmed.slice(5).trim();
                if (dataStr) onEvent(JSON.parse(dataStr));
              } catch (e) {
                console.warn('Failed to parse SSE line:', trimmed, e);
              }
            }
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Stream Fetch Error:', err);
        onEvent({ type: 'error', message: err.message });
      }
    }
  })();

  return () => controller.abort();
}

/** Fetches general metadata for a ticker (Sector, Industry, etc.) */
export async function fetchTickerInfo(ticker) {
  if (!ticker) return null;
  const res = await fetchWithTimeout(`${BASE}/ticker-info?ticker=${encodeURIComponent(ticker)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} - Failed to fetch ticker info`);
  return res.json();
}

/** Fetches commodity historical data and Holt-Winters forecasts. */
export async function fetchCommodities(period = 730, forecastDays = 10) {
  const res = await fetchWithTimeout(
    `${BASE}/commodities?period=${period}&forecast_days=${forecastDays}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} - Failed to fetch commodities`);
  return res.json();
}

/** Fetches GDP proxy data derived from country-specific ETFs. */
export async function fetchGdp(period = 730, forecastDays = 30) {
  const res = await fetchWithTimeout(
    `${BASE}/gdp?period=${period}&forecast_days=${forecastDays}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} - Failed to fetch GDP data`);
  return res.json();
}

/** Fetches US Treasury Bond yields (5Y, 10Y) and their spread. */
export async function fetchBonds(period = 730) {
  const res = await fetchWithTimeout(`${BASE}/bonds?period=${period}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} - Failed to fetch bond yields`);
  return res.json();
}

/** Basic health check for the FastAPI backend. */
export async function fetchHealth() {
  const res = await fetchWithTimeout(`${BASE}/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status} - Backend unhealthy`);
  return res.json();
}
