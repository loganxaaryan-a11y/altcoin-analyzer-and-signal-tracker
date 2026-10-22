#!/usr/bin/env bash
# verify-universe.sh — regenerates the UNIVERSE-v1.0.0 verification evidence.
# Exits non-zero if ANY supported row fails (pair not TRADING, spot trading not
# allowed, no 1d candle, no aggTrades print). Run: bash verify-universe.sh
set -uo pipefail
BASE="https://api.binance.us"
PAIRS="BTCUSDT ETHUSDT SOLUSDT LINKUSDT SUIUSDT DOGEUSDT XRPUSDT AVAXUSDT ADAUSDT BATUSDT"
OUT="/tmp/universe-verify-$(date -u +%Y%m%dT%H%M%SZ).json"
echo "pulling exchangeInfo..."
EI=$(curl -s -m 30 "$BASE/api/v3/exchangeInfo") || { echo "exchangeInfo fetch failed"; exit 2; }
echo "$EI" > /tmp/universe-verify-exchangeinfo.json
python3 - /tmp/universe-verify-exchangeinfo.json "$OUT" "$PAIRS" << 'PY'
import json, sys, urllib.request
d = json.load(open(sys.argv[1])); out_path = sys.argv[2]; pairs = sys.argv[3].split()
by_sym = {s['symbol']: s for s in d.get('symbols', [])}
results = []
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "universe-verify/1.0"})
    return json.loads(urllib.request.urlopen(req, timeout=20).read())
for p in pairs:
    s = by_sym.get(p)
    kl = get(f"https://api.binance.us/api/v3/klines?symbol={p}&interval=1d&limit=2")
    ag = get(f"https://api.binance.us/api/v3/aggTrades?symbol={p}&limit=1")
    ok = (s is not None and s.get('status') == 'TRADING'
          and s.get('isSpotTradingAllowed') is True
          and isinstance(kl, list) and len(kl) >= 1
          and isinstance(ag, list) and len(ag) >= 1)
    results.append({"pair": p,
                    "status": s.get('status') if s else "NOT_LISTED",
                    "spotAllowed": bool(s.get('isSpotTradingAllowed')) if s else False,
                    "klines_1d_bars": len(kl) if isinstance(kl, list) else 0,
                    "aggTrades_last_id": ag[0]['a'] if isinstance(ag, list) and ag else None,
                    "ok": ok})
json.dump({"generated_at": __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
           "exchangeinfo_serverTime": d.get('serverTime'),
           "results": results}, open(out_path, 'w'), indent=1)
fails = [r['pair'] for r in results if not r['ok']]
print("pairs:", len(results), "pass:", len(results) - len(fails), "fail:", fails if fails else "none")
sys.exit(1 if fails else 0)
PY
RC=$?
[ $RC -ne 0 ] && { echo "UNIVERSE VERIFICATION FAILED"; exit 1; }
echo "UNIVERSE VERIFICATION OK -> $OUT"
