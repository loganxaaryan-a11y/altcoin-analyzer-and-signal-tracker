#!/usr/bin/env python3
"""
OpenBB parser-library layer — pinned single-provider fetchers, driven
fetcher-direct (transform_query / aextract_data / transform_data,
credentials=None). NO router, NO meta-package, NO Workspace.
Approved shape: 13-openbb-code-check.md (2026-10-20).

Packages (pinned, ~/workspace/tools/openbb-venv):
  openbb-core 2.0.1, openbb-deribit 2.0.0, openbb-cboe 2.0.0,
  openbb-nasdaq 2.0.0, openbb-cftc 2.0.0

Role: parser/standardization supplement ONLY. The terminals' direct keyless
fetchers stay primary everywhere (Deribit raw API, Cboe CSVs, official CFTC
file). This layer answers concrete questions those reads don't cover:
Deribit funding history + chains with greeks, Cboe index snapshot family,
Nasdaq options chains + insider trading, standardized COT cross-check.

Environment adapter: this VM egresses via a proxy that aiohttp ignores by
default (trust_env=False) — direct TLS then fails WRONG_VERSION_NUMBER.
Forcing trust_env on aiohttp sessions routes through the sanctioned proxy;
`requests` (env-aware) verified 200s on the same hosts before this adapter.

Outputs (overwritten per run; every value carries fetched_at_utc + source):
  openbb/deribit.json  — crypto bundle
  openbb/equity.json   — equity bundle
Fail-soft per section: a failed fetcher records its error in the bundle and
never fabricates rows.

Usage: ~/workspace/tools/openbb-venv/bin/python openbb_layer.py
"""
import asyncio
import json
import os
import time
from datetime import datetime, timezone

import aiohttp

_orig_session_init = aiohttp.ClientSession.__init__


def _patched_session_init(self, *a, **kw):
    kw.setdefault("trust_env", True)
    _orig_session_init(self, *a, **kw)


aiohttp.ClientSession.__init__ = _patched_session_init
try:
    from aiohttp_client_cache import CachedSession

    _orig_cached_init = CachedSession.__init__

    def _patched_cached_init(self, *a, **kw):
        kw.setdefault("trust_env", True)
        _orig_cached_init(self, *a, **kw)

    CachedSession.__init__ = _patched_cached_init
except Exception:
    pass

BASE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE, "openbb")
SOURCE = ("OpenBB pinned fetchers (openbb-deribit/cboe/nasdaq/cftc 2.0.0, "
          "fetcher-direct, credentials=None)")
EQUITY_NAMES = ["AAPL", "PG", "MDLZ", "ISRG", "LRCX", "SCHW", "MO", "BAC",
                "NFLX", "BNY", "COF", "AVGO", "WMT"]
VIX_FAMILY = ["VIX", "VIX9D", "VIX3M", "VIX6M", "VVIX", "SKEW"]
# CFTC contract market codes — 098662 probe-verified live 2026-10-20;
# the rest resolved at runtime via CftcCotSearchFetcher, never guessed.
COT_SEARCH_TERMS = {
    "S&P 500 E-mini": "E-MINI S&P 500",
    "Nasdaq-100": "NASDAQ-100",
    "DJIA": "DJIA",
    "Russell 2000": "RUSSELL 2000",
    "VIX futures": "VIX",
    "UST 10Y": "TREASURY",
    "USD index": None,  # uses verified code 098662 directly
}
# Extra substring a resolved COT market name must contain (beyond the search
# term's first token) — keeps e.g. the 10Y note distinct from other tenors.
COT_NAME_REQUIRES = {"UST 10Y": "10"}


def utcnow():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _dump_one(r):
    if hasattr(r, "model_dump"):
        try:
            return r.model_dump(mode="json")
        except Exception:
            return r.model_dump()
    if isinstance(r, dict):
        return r
    return {"value": str(r)}


def rows_of(result):
    """Normalize any fetcher result shape to a list of plain dicts.

    Shapes seen live: list[Data]; a single Data (book summary); a RootModel
    wrapping list[contract] (options chains — model_dump() IS the list);
    a dict payload. Never guesses silently: unknown shapes become a
    one-row {"value": ...} record so the bundle shows what arrived.
    """
    if result is None:
        return []
    if isinstance(result, (list, tuple)):
        return [_dump_one(r) for r in result]
    if hasattr(result, "model_dump"):
        d = _dump_one(result)
        if isinstance(d, list):
            return [x if isinstance(x, dict) else {"value": x} for x in d]
        if isinstance(d, dict):
            lists = [v for v in d.values()
                     if isinstance(v, list) and v and isinstance(v[0], dict)]
            if len(lists) == 1:
                return lists[0]
            return [d]
        return [{"value": d}]
    if isinstance(result, dict):
        return [result]
    return [{"value": str(result)}]


def dump_rows(rows, limit=None):
    out = rows_of(rows)
    return out[: limit or len(out)]


def chain_aggregates(rows):
    """Per-expiry call/put OI totals + nearest-expiry summary from chain rows."""
    by_exp = {}
    total_contracts = 0
    for d in rows_of(rows):
        exp = str(d.get("expiration") or d.get("expiration_date") or "?")
        typ = str(d.get("option_type") or d.get("type") or "").lower()
        oi = d.get("open_interest") or 0
        try:
            oi = float(oi)
        except (TypeError, ValueError):
            oi = 0.0
        slot = by_exp.setdefault(exp, {"calls_oi": 0.0, "puts_oi": 0.0, "contracts": 0})
        if typ.startswith("c"):
            slot["calls_oi"] += oi
        elif typ.startswith("p"):
            slot["puts_oi"] += oi
        slot["contracts"] += 1
        total_contracts += 1
    exps = sorted(by_exp)
    nearest = exps[0] if exps else None
    tot_c = sum(v["calls_oi"] for v in by_exp.values())
    tot_p = sum(v["puts_oi"] for v in by_exp.values())
    return {
        "total_contracts": total_contracts,
        "expiries": len(exps),
        "total_call_oi": tot_c, "total_put_oi": tot_p,
        "put_call_oi_ratio": round(tot_p / tot_c, 4) if tot_c else None,
        "nearest_expiry": nearest,
        "nearest": by_exp.get(nearest) if nearest else None,
        "by_expiry": {e: by_exp[e] for e in exps[:6]},
    }


def _unwrap(obj):
    """Recursively replace AnnotatedResult wrappers with their .result.

    Some provider aextract_data implementations nest AnnotatedResult objects
    inside the returned payload (e.g. options-chain expirations); the router
    path unwraps them, fetcher-direct callers must. Found live 2026-10-20:
    Nasdaq/Deribit chains transform_data calls len() on the wrapper.
    """
    if type(obj).__name__ == "AnnotatedResult" and hasattr(obj, "result"):
        return _unwrap(obj.result)
    if isinstance(obj, dict):
        return {k: _unwrap(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_unwrap(v) for v in obj]
    return obj


async def fetch(mod_name, cls_name, params):
    import importlib
    F = getattr(importlib.import_module(mod_name), cls_name)
    q = F.transform_query(params)
    raw = await F.aextract_data(q, None)
    return _unwrap(F.transform_data(q, _unwrap(raw)))


async def deribit_bundle(errors):
    bundle = {}
    for coin in ("BTC", "ETH"):
        sec = {}
        try:
            rows = await fetch("openbb_deribit.models.funding_rate_history",
                               "DeribitFundingRateHistoryFetcher", {"symbol": coin})
            sec["funding_history"] = dump_rows(rows, 48)
        except Exception as e:
            errors[f"deribit_funding_{coin}"] = f"{type(e).__name__}: {e}"
        try:
            rows = await fetch("openbb_deribit.models.book_summary",
                               "DeribitBookSummaryFetcher", {"symbol": coin})
            sec["book_summary"] = dump_rows(rows, 5)
        except Exception as e:
            errors[f"deribit_book_{coin}"] = f"{type(e).__name__}: {e}"
        try:
            rows = await fetch("openbb_deribit.models.options_chains",
                               "DeribitOptionsChainsFetcher", {"symbol": coin})
            agg = chain_aggregates(rows)
            sec["options_chain_aggregates"] = agg
            sec["options_chain_rows"] = agg["total_contracts"]
            # Nearest-expiry contracts WITH greeks (bounded) — the
            # standardized greeks are this layer's additive value.
            nearest_rows = [r for r in rows_of(rows)
                            if str(r.get("expiration")) == agg.get("nearest_expiry")]
            sec["nearest_expiry_chain"] = nearest_rows[:200]
        except Exception as e:
            errors[f"deribit_chain_{coin}"] = f"{type(e).__name__}: {e}"
        bundle[coin] = sec
    return bundle


async def equity_bundle(errors):
    bundle = {}
    # Cboe index snapshots — VIX family term structure.
    try:
        rows = await fetch("openbb_cboe.models.index_snapshots",
                           "CboeIndexSnapshotsFetcher", {})
        keep = []
        for r in rows:
            d = r.model_dump() if hasattr(r, "model_dump") else dict(r)
            sym = str(d.get("symbol") or "")
            if sym in VIX_FAMILY or sym.lstrip("^") in VIX_FAMILY:
                keep.append({k: (str(v) if not isinstance(v, (int, float, bool, type(None))) else v)
                             for k, v in d.items() if v is not None})
        bundle["cboe_index_snapshots"] = keep
    except Exception as e:
        errors["cboe_index_snapshots"] = f"{type(e).__name__}: {e}"
    # Nasdaq insider trading + options chains for the board names.
    insiders, chains = {}, {}
    for sym in EQUITY_NAMES:
        try:
            rows = await fetch("openbb_nasdaq.models.insider_trading",
                               "NasdaqInsiderTradingFetcher", {"symbol": sym})
            insiders[sym] = dump_rows(rows, 25)
        except Exception as e:
            errors[f"nasdaq_insider_{sym}"] = f"{type(e).__name__}: {e}"
        try:
            rows = await fetch("openbb_nasdaq.models.options_chains",
                               "NasdaqOptionsChainsFetcher", {"symbol": sym})
            chains[sym] = chain_aggregates(rows)
        except Exception as e:
            errors[f"nasdaq_chain_{sym}"] = f"{type(e).__name__}: {e}"
    bundle["nasdaq_insider_trading"] = insiders
    bundle["nasdaq_options_chains"] = chains
    # Standardized COT cross-check — codes discovered via search, never guessed.
    cot = {}
    try:
        codes = {"USD index": "098662"}
        for label, term in COT_SEARCH_TERMS.items():
            if term is None:
                continue
            try:
                rows = await fetch("openbb_cftc.models.cot_search",
                                   "CftcCotSearchFetcher", {"query": term})
                for r in rows:
                    d = r.model_dump() if hasattr(r, "model_dump") else dict(r)
                    name = str(d.get("market_and_exchange_names") or d.get("name") or "")
                    code = d.get("cftc_contract_market_code") or d.get("code") or d.get("id")
                    need = COT_NAME_REQUIRES.get(label)
                    if (code and term.split()[0].lower() in name.lower()
                            and (need is None or need in name)):
                        codes[label] = str(code)
                        break
            except Exception as e:
                errors[f"cot_search_{label}"] = f"{type(e).__name__}: {e}"
            if label not in codes:
                errors.setdefault(f"cot_search_{label}",
                                  "no contract code resolved from search results")
        for label, code in codes.items():
            try:
                rows = await fetch("openbb_cftc.models.cot",
                                   "CftcCotFetcher", {"id": code})
                # The fetcher returns history in ASCENDING date order —
                # the current positioning is the LAST rows, not the first.
                dumped = dump_rows(rows)[-2:]
                head = dumped[-1] if dumped else {}
                cot[label] = {"code": code, "rows": dumped,
                              "market_name": head.get("market_and_exchange_names"),
                              "latest_date": head.get("date")}
            except Exception as e:
                errors[f"cot_{label}"] = f"{type(e).__name__}: {e}"
    except Exception as e:
        errors["cot_block"] = f"{type(e).__name__}: {e}"
    bundle["cftc_cot_standardized"] = cot
    return bundle


async def amain():
    os.makedirs(OUT_DIR, exist_ok=True)
    started = utcnow()
    errors = {}
    deribit = await deribit_bundle(errors)
    with open(os.path.join(OUT_DIR, "deribit.json"), "w") as f:
        json.dump({"fetched_at_utc": started, "source": SOURCE,
                   "layer": "OpenBB parser-library supplement — direct keyless fetchers remain primary",
                   "sections": deribit, "errors": {k: v for k, v in errors.items()
                                                   if k.startswith("deribit")}}, f, indent=1)
    equity = await equity_bundle(errors)
    with open(os.path.join(OUT_DIR, "equity.json"), "w") as f:
        json.dump({"fetched_at_utc": started, "source": SOURCE,
                   "layer": "OpenBB parser-library supplement — direct keyless fetchers remain primary",
                   "sections": equity, "errors": {k: v for k, v in errors.items()
                                                  if not k.startswith("deribit")}}, f, indent=1)
    print(json.dumps({"fetched_at_utc": started, "errors": errors}, indent=1))


if __name__ == "__main__":
    import sys
    # Ride-along staleness guard: a full collection takes minutes (many
    # provider calls); context data does not need a 30m refresh. When the
    # existing bundle is younger than 6h, exit immediately unless --force.
    if "--force" not in sys.argv:
        try:
            with open(os.path.join(OUT_DIR, "deribit.json")) as f:
                prev = json.load(f)
            prev_ts = datetime.strptime(prev["fetched_at_utc"], "%Y-%m-%dT%H:%M:%SZ")
            age_h = (datetime.now(timezone.utc).replace(tzinfo=None) - prev_ts).total_seconds() / 3600
            if age_h < 6:
                print(f"openbb bundle fresh ({age_h:.1f}h old) — skipped")
                sys.exit(0)
        except FileNotFoundError:
            pass
        except Exception:
            pass
    t0 = time.time()
    asyncio.run(amain())
    print(f"elapsed_s={time.time() - t0:.0f}")
