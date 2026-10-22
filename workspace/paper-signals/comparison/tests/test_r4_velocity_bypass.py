#!/usr/bin/env python3
"""R4 velocity-bypass verification (evidence item 3, workstream doc 47).

Standalone: python3 tests/test_r4_velocity_bypass.py

Registered rule (registrations/challenger-r1-v2.rule-text.md, R4 section):
the +15%/48H velocity bypass of the ATH hard gate is a baseline property
that must be preserved under the challenger: "The velocity bypass is
unchanged (it is a baseline property, recorded where the discovery record
shows it)." A velocity-bypassed asset must therefore NOT be hard-excluded
by R4's conjunction (>=75% below ATH AND below SMA50 AND 20D trend
negative), in either population:
  (a) pilot candidates  -> no `would_exclude_ath_conjunction`, and
  (b) upstream members  -> disposition is not `hard_exclude_conjunction`.

These tests inject a velocity-bypass marker through EVERY channel the
scorer actually reads, so a scorer that honours the bypass via any of
them passes:
  * candidate top-level fields (several plausible spellings),
  * candidate operationalEvidenceJson,
  * the ATH fields dict returned by the R4 joiner (the dict compose()
    and ath_disposition() consume).
Control cases (same conjunction, NO marker anywhere) must still
hard-exclude: they prove the harness can detect the exclusion, so a
failure on the bypass cases is the scorer's behaviour, not the test's.

Synthetic fetchers only; no network. Modeled on
tests/test_challenger_r1_v2.py.
"""
import importlib.util
import inspect
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)


def load_mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


S = load_mod("challenger_r1_v2", os.path.join(BASE, "challenger_r1_v2.py"))
REG = S.load_registration()
DEC = "2026-10-21T09:00:00.000Z"
DEC_MS = S.parse_ts_ms(DEC)
PASS = 0
FAIL = 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok  {name}")
    else:
        FAIL += 1
        print(f"FAIL  {name}  {detail}")


def factors(positioning_status="neutral"):
    base = [
        {"name": "Trend", "weight": 20, "status": "pass", "contribution": 20},
        {"name": "Momentum", "weight": 15, "status": "pass", "contribution": 15},
        {"name": "Volatility", "weight": 10, "status": "pass", "contribution": 10},
        {"name": "Volume", "weight": 15, "status": "pass", "contribution": 15},
        {"name": "Network fundamentals", "weight": 15, "status": "unavailable", "contribution": 0},
        {"name": "Supply overhang", "weight": 15, "status": "pass", "contribution": 15},
        {"name": "Positioning / funding", "weight": 10,
         "status": positioning_status,
         "contribution": 0 if positioning_status == "neutral" else 0},
    ]
    return base


# A +20.4%/48H velocity burst (the PHA emblem value from doc 37) clears the
# registered +15%/48H bypass bar. Every plausible spelling, in one place.
BYPASS_MARKERS = {
    "velocityBypass": True,
    "velocity_bypass": True,
    "velocityQualifier": True,
    "velocity_qualifier": True,
    "athGateBypassed": True,
    "ath_velocity_bypass": True,
    "velocity48hPct": 20.4,
    "velocity_48h_pct": 20.4,
    "change48hPct": 20.4,
}


def cand(bypass=False, **kw):
    c = {
        "id": 999, "candidateKey": "test", "symbol": "TEST", "coinId": "test-coin",
        "direction": "long", "decisionAt": DEC,
        "decisionReferencePrice": 100.0, "sourceObservedAt": "2026-10-21T08:59:00.000Z",
        "venue": "Binance Spot", "instrument": "TESTUSDT",
        "freezeVersion": "paper-pilot-v2.1.4", "productionHash": "prodhash",
        "challengerHash": "chalhash", "discoveryRunId": 137,
        "factorLedgerJson": json.dumps(factors()),
        "productionScore": 68, "permittedDriftBps": 50,
        "stopPrice": 95.0, "targetPrice": 107.5,
        "state": "issued", "reasonCode": None,
        "entryPrice": 100.1, "entryObservedAt": "2026-10-21T09:00:04.000Z",
    }
    if bypass:
        c.update(BYPASS_MARKERS)
        c["operationalEvidenceJson"] = json.dumps({
            "source": {"velocityBypass": True, "velocity48hPct": 20.4},
            "discovery": {"velocityQualifier": True,
                          "context": "velocity qualifier - +20.4%/48H burst; "
                                     "ATH gate bypassed by velocity"}})
    c.update(kw)
    return c


STATUS = {"handler_version": "2.1.9", "freeze": json.dumps({"version": "paper-pilot-v2.1.4"}),
          "venueMappings": [{"coinId": "test-coin", "instrument": "TESTUSDT",
                             "venue": "Binance Spot"}]}
CKPT = {"candidateId": 999, "coverageJson": json.dumps({"venue": "Binance Spot"}),
        "firstPrintPrice": 100.9, "firstPrintObservedAt": "2026-10-21T09:00:05.000Z",
        "firstVenueTradeId": "111"}


def timed_fetcher(received_ms):
    def fetch(symbol, start_ms, end_ms):
        rows = [{"a": 1, "p": "100.0", "T": DEC_MS - 5000},
                {"a": 2, "p": "100.2", "T": DEC_MS + 4000},
                {"a": 3, "p": "100.3", "T": DEC_MS + 9000}]
        rows = [r for r in rows if start_ms <= r["T"] <= end_ms] or rows[:1]
        return rows, {"pages": 1, "returned_count": len(rows),
                      "response_sha256": "x", "truncated": False,
                      "fetch_started_at": S.iso_ms(received_ms - 100),
                      "fetch_received_at": S.iso_ms(received_ms),
                      "fetch_started_ms": received_ms - 100,
                      "fetch_received_ms": received_ms}
    return fetch


def ath_dict(bypass=False):
    """The exact dict shape FakeR4 in test_challenger_r1_v2.py returns for a
    full conjunction, optionally carrying the bypass marker."""
    d = {"component": "ath", "ath_component": "evaluated",
         "ath": 1000.0, "ath_date": "2021-01-01", "ath_basis": "coingecko_ath",
         "ath_distance_pct": -90.0, "price_vs_sma50_pct": -5.0,
         "price_below_sma50": True, "trend20d_pct": -3.0,
         "trend20d_negative": True, "conjunction_hard_exclusion": True,
         "fields_basis": "historical_series_asof_decision",
         "fields_fetched_at": DEC, "fields_received_at": DEC}
    if bypass:
        d.update(BYPASS_MARKERS)
    return d


class FakeR4Bypass(S.R4Joiner):
    """R4 joiner returning a fixed conjunction dict, with or without the
    bypass marker on the ATH record itself."""
    def __init__(self, bypass):
        super().__init__(cg_fetcher=lambda path: (_ for _ in ()).throw(RuntimeError("off")))
        self.bypass = bypass

    def fields_for(self, coin_id, decision_ms, decision_price):
        return ath_dict(bypass=self.bypass)


FETCH = timed_fetcher(DEC_MS + 3600_000)

# 0. Code-level channel: does the scorer contain any velocity/bypass read?
with open(os.path.join(BASE, "challenger_r1_v2.py")) as f:
    scorer_src = f.read().lower()
check("scorer source mentions velocity or bypass at all",
      ("velocity" in scorer_src) or ("bypass" in scorer_src),
      "0 occurrences of 'velocity'/'bypass' in challenger_r1_v2.py")

# 0b. API-level channel: fields_for has no input a bypass could arrive on.
params = list(inspect.signature(S.R4Joiner.fields_for).parameters)
check("R4Joiner.fields_for accepts a velocity-bypass input",
      any("veloc" in p or "bypass" in p for p in params),
      f"fields_for parameters are {params}")

# 1. Pilot candidate: full conjunction + velocity-bypass marker everywhere
#    -> must NOT be hard-excluded, no would_exclude divergence.
rec = S.score_candidate(cand(bypass=True), CKPT, STATUS, REG, FETCH,
                        FakeR4Bypass(bypass=True))
ath_divs = [d for d in rec["divergences"] if d["component"] == "ath_contextual"]
check("bypassed pilot + conjunction -> NOT would_exclude_ath_conjunction",
      rec["challenger_disposition"] != "would_exclude_ath_conjunction",
      f"challenger_disposition={rec['challenger_disposition']}")
check("bypassed pilot + conjunction -> no ath_contextual would_exclude divergence",
      not any(d["challenger_treatment"] == "would_exclude_ath_conjunction"
              for d in ath_divs),
      f"ath divergences={ath_divs}")

# 2. Upstream population member: conjunction + bypass marker on the ATH
#    record -> disposition must not be hard_exclude_conjunction.
disp = S.ath_disposition(ath_dict(bypass=True))
check("bypassed upstream member + conjunction -> NOT hard_exclude_conjunction",
      disp != "hard_exclude_conjunction",
      f"ath_disposition={disp}")

# 3. CONTROL (no bypass anywhere): the same conjunction must still
#    hard-exclude in both populations - proves the harness detects it.
rec_ctl = S.score_candidate(cand(bypass=False), CKPT, STATUS, REG, FETCH,
                            FakeR4Bypass(bypass=False))
check("CONTROL pilot, conjunction, no bypass -> would_exclude_ath_conjunction",
      rec_ctl["challenger_disposition"] == "would_exclude_ath_conjunction",
      f"challenger_disposition={rec_ctl['challenger_disposition']}")
disp_ctl = S.ath_disposition(ath_dict(bypass=False))
check("CONTROL upstream, conjunction, no bypass -> hard_exclude_conjunction",
      disp_ctl == "hard_exclude_conjunction",
      f"ath_disposition={disp_ctl}")

print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
