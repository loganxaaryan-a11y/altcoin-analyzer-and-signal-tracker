#!/usr/bin/env python3
"""TraderSpy prospective caller-ledger pilot — grader (traderspy-grade-v1.2).

For each ledger signal not yet graded, reconstruct the outcome from Binance
USD-M FUTURES 1-minute data (data.binance.vision daily archives — futures
signals require futures evidence; spot is never used as a verdict).

Vendor judging rules (from /v1/signals/stats howToRead), applied to the
levels frozen in the first-seen ledger record:
- judged on 1-minute highs/lows after entry for 24 candles of the signal's
  timeframe (24h for 1h signals, 4 days for 4h signals);
- outcome = highest TP reached before the stop was touched;
- a stop touched in the same minute as a TP counts as stopped (that TP does
  not count);
- neither touched by horizon close = expired.

Corrected labels (expert review, 2026-10-21) are binding:
- A signal inside its horizon is still_open and is NEVER graded early and
  NEVER called expired.
- profit_locked is kept as its own outcome class `vendor_profit_locked` —
  never a target win, never a loss. The vendor's claimed exit price/time come
  from the signal detail endpoint, flagged vendor-reported, pending separate
  rule verification.
- Grades for signals first seen by us only after their horizon had already
  closed are labeled `retrospective_context` and excluded from prospective
  tallies. Prospective means first-seen by us while the signal was live.

Eligibility (expert/Logan correction, 2026-10-21 — v1.1): our first-seen
timestamp proves when WE received a signal; it does not by itself make the
signal a prospective ENTRY. A signal first seen while already underway —
its trade already decided or mostly played out before we ever saw it — is
not prospective performance. Every grade therefore also carries an
`entry_class`, computed by compute_eligibility() exactly as the README's
eligibility rule states (no daylight between doc and code):

- `retrospective_context` — horizon had already closed at first-seen.
- `observed_underway` — first seen live, but a prospective-entry test failed:
  (a) TP1 or SL was touched in [vendor createdAt, first_seen); or
  (b2) a vendor-documented exit time precedes first_seen; or
  (b1) the close of the 1m bar containing first_seen was no longer on the
       entry side of TP1 with at least half the entry->TP1 distance
       remaining.
- `prospective_entry` — first seen live and every test passed.
- `unverifiable` — eligibility could not be established (e.g. no TP1 level
  published); excluded from prospective tallies (fail closed).
If no test has failed but the data needed to pass a test is not yet
available (an archive day inside the pre-observation window is unpublished),
the grade/correction DEFERS to a later run instead of guessing.

v1.1 also re-labels every v1 grade: for each signal graded under
traderspy-grade-v1 with no v1.1 record yet, it appends a `grade_correction`
record that carries the v1 outcome forward verbatim and adds `entry_class`
+ `eligibility` facts, with a `corrects` pointer to the v1 record.
grades.jsonl is append-only; history is never rewritten.

Modeled entry (expert correction, 2026-10-21 — v1.2): passing the v1.1
eligibility screens does NOT establish that the vendor's advertised entry
was obtainable. A prospective return must begin at a price actually
available AFTER our first observation. So for a signal that passes the
screens, the modeled entry price is the OPEN of the first Binance USD-M
futures 1m bar whose open time is >= our first_seen timestamp. If that bar
is not yet available (archive unpublished), grading DEFERS — no other price
is ever substituted. If the modeled entry is already beyond TP1 or beyond
SL, the row is NOT a prospective entry: entry_class becomes
`modeled_entry_unavailable`, with the fact recorded. Prospective outcome
measurement runs from the modeled entry bar against the frozen
TP1/TP2/TP3/SL levels, first touch deciding, and R is computed off the
modeled entry: denominator |modeled entry - SL|; a TP outcome's R is
(TP - modeled entry)/denominator, direction-aware; stop = -1R gross.
Costs: a round-trip cost of 0.18% of the modeled entry price, in R terms
(cost_R = 0.0018 * modeled entry / |modeled entry - SL|), is reported as
gross R / cost R / net R — a modeling assumption (the same derived
convention as the crypto book's reporting), not a vendor fact.
v1.2 appends a correction superseding the entry basis of any earlier
record that claims `prospective_entry`; all other earlier records stand
(their classes are excluded from prospective performance, so their entry
basis is immaterial). Non-prospective rows keep the v1 informational R
(vendor entry basis) and carry no prospective R fields.

Idempotent: keyed by signal id + grader version; a re-run appends nothing
except genuine corrections/grades once.
R convention (informational rows): risk = |entry - SL|; a TP outcome
scores |TP - entry| / risk at the highest TP touched; stop = -1R;
expired = 0R. R is meaningful only over matured rows, and prospective R
only over `prospective_entry` rows graded on the modeled entry.
"""
import csv
import io
import json
import os
import re
import subprocess
import sys
import zipfile
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.path.expanduser(
    "~/workspace/custom-connectors/custom.traderspy/bin/traderspy.py")
LEDGER = os.path.join(HERE, "ledger.jsonl")
GRADES = os.path.join(HERE, "grades.jsonl")
CACHE = os.path.join(HERE, "kline_cache")
GRADER_VERSION = "traderspy-grade-v1.2"
PRIOR_GRADER_VERSION = "traderspy-grade-v1"
MID_GRADER_VERSION = "traderspy-grade-v1.1"
ARCHIVE = ("https://data.binance.vision/data/futures/um/daily/klines/"
           "{sym}/1m/{sym}-1m-{day}.zip")
VENDOR_EXIT_STATES = {"tp1_hit", "tp2_hit", "tp3_hit", "stop", "expired"}
MAX_DETAIL_FETCHES_PER_RUN = 5
MIN_TP1_FRACTION_REMAINING = 0.5
ROUND_TRIP_COST_RATE = 0.0018  # 0.18% of modeled entry price, in R terms


def parse_ts(text: str) -> datetime:
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%S.%fZ").replace(
        tzinfo=timezone.utc)


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def timeframe_seconds(tf: str) -> int | None:
    m = re.fullmatch(r"(\d+)([mhd])", tf or "")
    if not m:
        return None
    n, unit = int(m.group(1)), m.group(2)
    return n * {"m": 60, "h": 3600, "d": 86400}[unit]


def load_ledger():
    first_seen, latest_status = {}, {}
    if os.path.exists(LEDGER):
        with open(LEDGER) as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                sid = rec.get("signal_id")
                if rec.get("record_type") == "first_seen":
                    first_seen[sid] = rec
                    latest_status[sid] = rec.get("vendor_status_at_first_seen")
                elif rec.get("record_type") == "observation":
                    latest_status[sid] = rec.get("vendor_status")
    return first_seen, latest_status


def load_grade_records():
    """Return (prior_v1, mid_v11, current_v12_ids): latest v1 grade per
    signal id, latest v1.1 record per signal id, and the set of signal ids
    that already carry a v1.2 record."""
    prior, mid, current = {}, {}, set()
    if os.path.exists(GRADES):
        with open(GRADES) as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                sid = rec.get("signal_id")
                if rec.get("grader_version") == PRIOR_GRADER_VERSION:
                    prior[sid] = rec
                elif rec.get("grader_version") == MID_GRADER_VERSION:
                    mid[sid] = rec
                elif rec.get("grader_version") == GRADER_VERSION:
                    current.add(sid)
    return prior, mid, current


def fetch_day_bars(symbol: str, day: str):
    """Return list of (open_ms, high, low) for one UTC day, or None if the
    archive file does not exist / cannot be read. Cached on disk."""
    cache_path = os.path.join(CACHE, f"{symbol}-1m-{day}.csv")
    if os.path.exists(cache_path):
        with open(cache_path, newline="") as fh:
            rows = list(csv.reader(fh))
    else:
        url = ARCHIVE.format(sym=symbol, day=day)
        result = subprocess.run(
            ["curl", "-sf", "--max-time", "60", "-o", "/dev/stdout", url],
            capture_output=True, timeout=90)
        if result.returncode != 0 or not result.stdout:
            return None
        try:
            zf = zipfile.ZipFile(io.BytesIO(result.stdout))
            name = zf.namelist()[0]
            text = zf.read(name).decode("utf-8")
        except Exception:
            return None
        rows = list(csv.reader(io.StringIO(text)))
        with open(cache_path, "w") as fh:
            fh.write(text)
    bars = []
    for row in rows:
        if not row:
            continue
        try:
            open_ms = int(float(row[0]))
            high = float(row[2])
            low = float(row[3])
        except (ValueError, IndexError):
            continue  # header or malformed line
        if open_ms > 10**14:  # microseconds epoch in newer archive files
            open_ms //= 1000
        bars.append((open_ms, high, low))
    return bars


def fetch_day_bars_full(symbol: str, day: str):
    """Like fetch_day_bars but (open_ms, open, high, low, close) — the
    eligibility check needs the close of the bar containing first-seen.
    Shares the same on-disk cache (raw CSV text)."""
    cache_path = os.path.join(CACHE, f"{symbol}-1m-{day}.csv")
    if os.path.exists(cache_path):
        with open(cache_path, newline="") as fh:
            rows = list(csv.reader(fh))
    else:
        url = ARCHIVE.format(sym=symbol, day=day)
        result = subprocess.run(
            ["curl", "-sf", "--max-time", "60", "-o", "/dev/stdout", url],
            capture_output=True, timeout=90)
        if result.returncode != 0 or not result.stdout:
            return None
        try:
            zf = zipfile.ZipFile(io.BytesIO(result.stdout))
            name = zf.namelist()[0]
            text = zf.read(name).decode("utf-8")
        except Exception:
            return None
        rows = list(csv.reader(io.StringIO(text)))
        with open(cache_path, "w") as fh:
            fh.write(text)
    bars = []
    for row in rows:
        if not row:
            continue
        try:
            open_ms = int(float(row[0]))
            open_ = float(row[1])
            high = float(row[2])
            low = float(row[3])
            close = float(row[4])
        except (ValueError, IndexError):
            continue  # header or malformed line
        if open_ms > 10**14:  # microseconds epoch in newer archive files
            open_ms //= 1000
        bars.append((open_ms, open_, high, low, close))
    return bars


def compute_eligibility(rec: dict, horizon_close: datetime,
                        vendor_exit_at: datetime | None):
    """Prospective-entry eligibility, exactly as stated in the README.

    Returns (entry_class, facts); entry_class is "prospective_entry",
    "observed_underway", "retrospective_context", "unverifiable", or
    "defer" (no test failed yet, but the data needed to pass a test is not
    yet available — retry on a later run; nothing is recorded).
    """
    created = parse_ts(rec["vendor_created_at"])
    first_seen = parse_ts(rec["snapshot_at"])
    side = rec["side"]
    levels = rec.get("levels", {})
    entry = rec.get("entry_price")
    tp1 = levels.get("tp1")
    sl = levels.get("sl")
    facts = {"tests": {}}

    if first_seen > horizon_close:
        facts["basis"] = ("horizon had already closed at first-seen; "
                          "eligibility tests do not apply")
        return "retrospective_context", facts

    start_ms = int(created.timestamp() * 1000) // 60000 * 60000
    fs_ms = int(first_seen.timestamp() * 1000)

    days = []
    day = created.date()
    while day <= first_seen.date():
        days.append(day.isoformat())
        day += timedelta(days=1)
    bars = []
    missing_days = []
    for d in days:
        day_bars = fetch_day_bars_full(rec["symbol"], d)
        if day_bars is None:
            missing_days.append(d)
        else:
            bars.extend(day_bars)
    bars.sort(key=lambda b: b[0])
    coverage_complete = not missing_days
    facts["pre_observation_window"] = {
        "from": iso(created), "to": iso(first_seen),
        "coverage_complete": coverage_complete,
        "missing_days": missing_days,
    }

    def tp_touched(level, high, low):
        if level is None:
            return False
        return high >= level if side == "buy" else low <= level

    def sl_touched(level, high, low):
        if level is None:
            return False
        return low <= level if side == "buy" else high >= level

    # --- Test (a): no TP1 / SL touch in [createdAt, first_seen) ----------
    tp1_touch_at = None
    sl_touch_at = None
    price_at_first_seen = None
    for open_ms, _open, high, low, close in bars:
        if start_ms <= open_ms < fs_ms:
            if tp1_touch_at is None and tp_touched(tp1, high, low):
                tp1_touch_at = open_ms
            if sl_touch_at is None and sl_touched(sl, high, low):
                sl_touch_at = open_ms
        if open_ms <= fs_ms < open_ms + 60000:
            price_at_first_seen = close
    facts["tests"]["a_pre_observation_touches"] = {
        "tp1_touched_at": (iso(datetime.fromtimestamp(
            tp1_touch_at / 1000, tz=timezone.utc)) if tp1_touch_at else None),
        "sl_touched_at": (iso(datetime.fromtimestamp(
            sl_touch_at / 1000, tz=timezone.utc)) if sl_touch_at else None),
        "bars_scanned_through": (
            "full window" if coverage_complete else
            "available bars only — archive day(s) unpublished"),
    }
    if tp1_touch_at is not None or sl_touch_at is not None:
        facts["deciding_test"] = "a"
        return "observed_underway", facts

    # --- Test (b2): no vendor-documented exit before first_seen ----------
    if vendor_exit_at is not None:
        facts["tests"]["b2_vendor_exit"] = {
            "vendor_exit_at": iso(vendor_exit_at),
            "before_first_seen": vendor_exit_at < first_seen,
        }
        if vendor_exit_at < first_seen:
            facts["deciding_test"] = "b2"
            return "observed_underway", facts

    # No test has failed. Passing (a) and (b1) needs complete data.
    if not coverage_complete:
        facts["defer_reason"] = (
            "no failing test yet, but archive day(s) "
            + ", ".join(missing_days)
            + " inside the pre-observation window are unpublished; "
              "eligibility cannot be passed on partial data")
        return "defer", facts
    if price_at_first_seen is None:
        facts["defer_reason"] = ("bar containing first_seen not present in "
                                 "the archive data; retry on a later run")
        return "defer", facts

    # --- Test (b1): still meaningfully available at first_seen -----------
    if tp1 is None or entry is None:
        facts["tests"]["b1_availability"] = {
            "result": "cannot evaluate — no TP1 level published"}
        facts["deciding_test"] = "b1"
        return "unverifiable", facts
    entry = float(entry)
    tp1 = float(tp1)
    if side == "buy":
        fraction = (tp1 - price_at_first_seen) / (tp1 - entry)
    else:
        fraction = (price_at_first_seen - tp1) / (entry - tp1)
    fraction = round(fraction, 4)
    facts["tests"]["b1_availability"] = {
        "price_at_first_seen": price_at_first_seen,
        "price_basis": "close of the 1m futures bar containing first_seen",
        "tp1_distance_remaining_fraction": fraction,
        "minimum_required": MIN_TP1_FRACTION_REMAINING,
    }
    if fraction < MIN_TP1_FRACTION_REMAINING:
        facts["deciding_test"] = "b1"
        return "observed_underway", facts

    facts["deciding_test"] = None
    return "prospective_entry", facts


def reconstruct(rec: dict, horizon_close: datetime, now: datetime,
                start_override_ms: int | None = None):
    """Scan futures 1m bars over [start, min(horizon_close, now)), where
    start is the created-minute by default, or `start_override_ms` (the
    modeled-entry bar, for prospective rows under v1.2).

    Returns (status, detail) where status is one of:
      "decisive"     — outcome final; detail has outcome_class + touches
      "still_open"   — horizon not closed, nothing decisive yet
      "unverifiable" — data gap inside the judged window (reason in detail)
      "defer"        — archive plausibly unpublished yet; retry next run
    """
    created = parse_ts(rec["vendor_created_at"])
    side = rec["side"]
    levels = rec["levels"]
    start_ms = (start_override_ms if start_override_ms is not None
                else int(created.timestamp() * 1000) // 60000 * 60000)
    end_dt = min(horizon_close, now)
    end_ms = int(end_dt.timestamp() * 1000)

    days = []
    day = created.date()
    while day <= end_dt.date():
        days.append(day.isoformat())
        day += timedelta(days=1)

    bars_by_day = {}
    missing_days = []
    for d in days:
        bars = fetch_day_bars(rec["symbol"], d)
        if bars is None:
            missing_days.append(d)
        else:
            bars_by_day[d] = bars

    def touched(level, high, low):
        if level is None:
            return False
        return high >= level if side == "buy" else low <= level

    def sl_touched(high, low):
        level = levels.get("sl")
        if level is None:
            return False
        return low <= level if side == "buy" else high >= level

    touches = {}          # counted touches: key -> ISO time
    ignored_same_bar = [] # TPs first touched in the stop bar (do not count)
    outcome = None
    decisive_at_ms = None

    all_bars = []
    for d in days:
        all_bars.extend(bars_by_day.get(d, []))
    all_bars.sort(key=lambda b: b[0])

    for open_ms, high, low in all_bars:
        if open_ms < start_ms or open_ms >= end_ms:
            continue
        stop_now = sl_touched(high, low)
        tps_now = [k for k in ("tp1", "tp2", "tp3")
                   if k not in touches and touched(levels.get(k), high, low)]
        if stop_now:
            touches.setdefault("sl", iso(datetime.fromtimestamp(
                open_ms / 1000, tz=timezone.utc)))
            ignored_same_bar = tps_now
            best = next((k for k in ("tp3", "tp2", "tp1") if k in touches),
                        None)
            outcome = best + "_hit" if best else "stop"
            decisive_at_ms = open_ms
            break
        for k in tps_now:
            touches[k] = iso(datetime.fromtimestamp(
                open_ms / 1000, tz=timezone.utc))
        if "tp3" in touches:
            outcome = "tp3_hit"
            decisive_at_ms = open_ms
            break

    horizon_closed = now >= horizon_close
    # A missing day only matters if it starts before the outcome was decided
    # (or before the scan end when nothing was decided).
    cutoff_ms = decisive_at_ms if decisive_at_ms is not None else end_ms
    relevant_missing = [d for d in missing_days
                        if int(datetime.fromisoformat(d).replace(
                            tzinfo=timezone.utc).timestamp() * 1000) < cutoff_ms]
    if relevant_missing:
        if not horizon_closed:
            return "still_open", {}
        if now < horizon_close + timedelta(hours=36):
            return "defer", {"missing_days": relevant_missing}
        return "unverifiable", {
            "reason": "no Binance USD-M futures 1m archive for day(s) "
                      + ", ".join(relevant_missing)
                      + " inside the judged window",
            "missing_days": relevant_missing,
        }
    if outcome is not None:
        return "decisive", {"outcome_class": outcome, "touches": touches,
                            "ignored_same_bar_as_stop": ignored_same_bar}
    if horizon_closed:
        best = next((k for k in ("tp3", "tp2", "tp1") if k in touches), None)
        return "decisive", {
            "outcome_class": (best + "_hit") if best else "expired",
            "touches": touches, "ignored_same_bar_as_stop": []}
    return "still_open", {}


def r_multiple(rec: dict, outcome_class: str, entry_override=None):
    entry = entry_override if entry_override is not None \
        else rec.get("entry_price")
    levels = rec.get("levels", {})
    sl = levels.get("sl")
    if entry is None or sl is None:
        return None
    risk = abs(float(entry) - float(sl))
    if risk == 0:
        return None
    if outcome_class == "stop":
        return -1.0
    if outcome_class == "expired":
        return 0.0
    if outcome_class in ("tp1_hit", "tp2_hit", "tp3_hit"):
        tp = levels.get(outcome_class.replace("_hit", ""))
        if tp is None:
            return None
        return round(abs(float(tp) - float(entry)) / risk, 4)
    return None


def modeled_entry(rec: dict):
    """Modeled prospective entry (v1.2): the OPEN of the first Binance
    USD-M futures 1m bar whose open time is >= our first_seen timestamp.

    Returns (status, facts): status "ok" | "defer" | "unavailable".
    "defer" — the bar is not in the published archive yet; no other price
    may be substituted, so grading retries on a later run.
    "unavailable" — the modeled entry price is already beyond TP1 or
    beyond SL; the row is not a prospective entry (fact recorded)."""
    first_seen = parse_ts(rec["snapshot_at"])
    fs_ms = int(first_seen.timestamp() * 1000)
    bar_ms = -(-fs_ms // 60000) * 60000  # ceil to the next minute boundary
    bar_dt = datetime.fromtimestamp(bar_ms / 1000, tz=timezone.utc)
    facts = {"convention": ("open of the first Binance USD-M futures 1m "
                            "bar whose open time is >= first_seen"),
             "bar_open_time": iso(bar_dt)}
    bars = fetch_day_bars_full(rec["symbol"], bar_dt.date().isoformat())
    if bars is None:
        facts["defer_reason"] = (
            "archive day " + bar_dt.date().isoformat()
            + " holding the modeled-entry bar is not yet published")
        return "defer", facts
    bar = next((b for b in bars if b[0] == bar_ms), None)
    if bar is None:
        facts["defer_reason"] = ("modeled-entry bar not present in the "
                                 "archive day; retry on a later run")
        return "defer", facts
    price = bar[1]
    facts["price"] = price
    facts["bar_open_ms"] = bar_ms
    levels = rec.get("levels", {})
    side = rec["side"]
    tp1 = levels.get("tp1")
    sl = levels.get("sl")
    if tp1 is not None:
        if (side == "buy" and price >= float(tp1)) or \
                (side == "sell" and price <= float(tp1)):
            facts["beyond_level"] = "tp1"
            facts["level_price"] = tp1
            return "unavailable", facts
    if sl is not None:
        if (side == "buy" and price <= float(sl)) or \
                (side == "sell" and price >= float(sl)):
            facts["beyond_level"] = "sl"
            facts["level_price"] = sl
            return "unavailable", facts
    return "ok", facts


def prospective_r(outcome_class: str, modeled_price, levels: dict,
                  side: str):
    """Gross / cost / net R off the MODELED entry (v1.2). Denominator
    |modeled entry - SL|; a TP outcome's R is (TP - modeled entry) /
    denominator, direction-aware; stop = -1R gross; expired = 0R gross.
    Cost: round-trip 0.18% of the modeled entry price converted to R —
    a modeling assumption (the crypto book's derived convention), not a
    vendor fact. Returns None when R cannot be computed."""
    sl = levels.get("sl")
    if modeled_price is None or sl is None:
        return None
    risk = abs(float(modeled_price) - float(sl))
    if risk == 0:
        return None
    if outcome_class == "stop":
        gross = -1.0
    elif outcome_class == "expired":
        gross = 0.0
    elif outcome_class in ("tp1_hit", "tp2_hit", "tp3_hit"):
        tp = levels.get(outcome_class.replace("_hit", ""))
        if tp is None:
            return None
        gross = ((float(tp) - float(modeled_price)) if side == "buy"
                 else (float(modeled_price) - float(tp))) / risk
    else:
        return None
    gross = round(gross, 4)
    cost = round(ROUND_TRIP_COST_RATE * float(modeled_price) / risk, 4)
    return {"gross": gross, "cost": cost, "net": round(gross - cost, 4),
            "risk_per_unit": risk, "cost_rate": ROUND_TRIP_COST_RATE,
            "basis": "modeled_entry"}


def vendor_exit_claim(signal_id: str):
    """Vendor-reported exit price/time from the detail endpoint."""
    result = subprocess.run(
        ["python3", HELPER, f"/v1/signals/{signal_id}"],
        capture_output=True, text=True, timeout=90)
    if result.returncode != 0:
        return None
    try:
        detail = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None
    resolution = (detail.get("history") or {}).get("resolution")
    if not resolution:
        return None
    at_ms = resolution.get("at")
    return {
        "status": resolution.get("status"),
        "price": resolution.get("price"),
        "at": iso(datetime.fromtimestamp(at_ms / 1000, tz=timezone.utc))
              if at_ms else None,
        "source": "vendor detail endpoint history.resolution",
        "vendor_reported": True,
        "rule_verification": "pending_separate_verification",
    }


def append_grade(record: dict) -> None:
    with open(GRADES, "a") as fh:
        fh.write(json.dumps(record) + "\n")


def _modeled_rebase(rec, horizon_close, now, old_outcome):
    """Resolve the v1.2 entry basis for a row claiming prospective_entry.

    Returns (action, payload): action "defer" | "unavailable" |
    "unverifiable" | "ok". On "ok" for a reconstructed outcome class the
    payload carries the outcome re-scanned from the modeled-entry bar and
    the modeled-basis gross/cost/net R; a vendor_profit_locked row keeps
    its vendor outcome (its R is null by rule) and only gains the
    modeled_entry facts."""
    me_status, me_facts = modeled_entry(rec)
    if me_status == "defer":
        return "defer", {"modeled_entry": me_facts}
    public = {k: v for k, v in me_facts.items() if k != "bar_open_ms"}
    if me_status == "unavailable":
        return "unavailable", {"modeled_entry": public}
    payload = {"modeled_entry": public}
    if old_outcome == "vendor_profit_locked":
        return "ok", payload
    status, detail = reconstruct(rec, horizon_close, now,
                                 start_override_ms=me_facts["bar_open_ms"])
    if status == "defer":
        return "defer", payload
    if status != "decisive":
        payload["rebase_scan_status"] = status
        payload["unverifiable_reason"] = detail.get("reason")
        return "unverifiable", payload
    outcome = detail["outcome_class"]
    payload["outcome_class"] = outcome
    payload["touches"] = detail.get("touches", {})
    payload["ignored_same_bar_as_stop"] = detail.get(
        "ignored_same_bar_as_stop", [])
    pr = prospective_r(outcome, me_facts["price"], rec.get("levels", {}),
                       rec["side"])
    if pr is not None:
        payload["r_gross"] = pr["gross"]
        payload["r_cost"] = pr["cost"]
        payload["r_net"] = pr["net"]
        payload["r_multiple"] = pr["gross"]
        payload["r_detail"] = pr
    return "ok", payload


def append_corrections(first_seen, prior, mid, current, now, counts,
                       by_class):
    """v1.2 corrections. Two groups; every other earlier record stands
    (its class is excluded from prospective performance, so its entry
    basis is immaterial):
    (1) v1 grades with no v1.1 record yet — the v1.1 eligibility
        re-label, stamped v1.2, outcome carried forward verbatim unless
        the class is prospective_entry, where the basis is re-based.
    (2) v1.1 records claiming entry_class == prospective_entry — a v1.2
        correction superseding the entry basis with the modeled entry.
    Corrections never fetch new vendor detail records — the prior
    record's captured vendor_exit_claim is reused (budget-safe)."""
    candidates = []
    for sid, old in prior.items():
        if sid not in mid and sid not in current:
            candidates.append((sid, old, PRIOR_GRADER_VERSION, "relabel"))
    for sid, old in mid.items():
        if sid not in current \
                and old.get("entry_class") == "prospective_entry":
            candidates.append((sid, old, MID_GRADER_VERSION, "rebase"))
    for sid, old, prior_version, kind in candidates:
        rec = first_seen.get(sid)
        if rec is None:
            counts["corrections_deferred"] += 1
            continue
        tf_secs = timeframe_seconds(rec.get("timeframe"))
        if tf_secs is None:
            entry_class, facts = "unverifiable", {
                "basis": f"unknown timeframe {rec.get('timeframe')!r}"}
            horizon_close = None
        else:
            created = parse_ts(rec["vendor_created_at"])
            horizon_close = created + timedelta(seconds=24 * tf_secs)
            if kind == "rebase":
                entry_class = "prospective_entry"
                facts = old.get("eligibility", {})
            else:
                claim = old.get("vendor_exit_claim") or {}
                vendor_exit_at = (parse_ts(claim["at"])
                                  if claim.get("at") else None)
                entry_class, facts = compute_eligibility(
                    rec, horizon_close, vendor_exit_at)
        if entry_class == "defer":
            counts["corrections_deferred"] += 1
            continue
        if kind == "rebase":
            reason = (
                "v1.2 supersedes the v1.1 entry basis: passing the "
                "eligibility screens does not establish that the "
                "advertised entry was obtainable. The prospective entry "
                "is re-based on the modeled entry (open of the first "
                "futures 1m bar at/after first_seen), with R recomputed "
                "off the modeled entry and the 0.18% round-trip cost "
                "reported as gross/cost/net.")
        else:
            reason = (
                "v1 labeled maturity by first-seen vs horizon close only; "
                "first-seen does not make a signal a prospective entry. "
                "v1.1 adds the prospective-entry eligibility rule "
                "(README): pre-observation TP1/SL touch, vendor-documented "
                "exit before first_seen, or <50% of the entry->TP1 "
                "distance remaining at first_seen => observed_underway, "
                "excluded from prospective performance. Outcome carried "
                "forward unchanged unless the class is prospective_entry, "
                "where v1.2 re-bases the entry on the modeled entry.")
        record = dict(old)
        updates = {
            "record_type": "grade_correction",
            "grader_version": GRADER_VERSION,
            "graded_at": iso(now),
            "entry_class": entry_class,
            "eligibility": facts,
            "corrects": {
                "signal_id": sid,
                "grader_version": prior_version,
                "graded_at": old.get("graded_at"),
                "outcome_class": old.get("outcome_class"),
                "maturity": old.get("maturity"),
                "entry_class": old.get("entry_class"),
            },
            "correction_reason": reason,
        }
        if entry_class == "prospective_entry" and horizon_close is not None:
            action, payload = _modeled_rebase(
                rec, horizon_close, now, old.get("outcome_class"))
            if action == "defer":
                counts["corrections_deferred"] += 1
                continue
            updates["modeled_entry"] = payload["modeled_entry"]
            if action == "unavailable":
                updates["entry_class"] = "modeled_entry_unavailable"
                updates["r_multiple"] = None
            elif action == "unverifiable":
                updates["outcome_class"] = "unverifiable"
                updates["unverifiable_reason"] = payload.get(
                    "unverifiable_reason")
                updates["r_multiple"] = None
            elif "outcome_class" in payload:
                updates["outcome_class"] = payload["outcome_class"]
                updates["touches"] = payload.get("touches", {})
                updates["ignored_same_bar_as_stop"] = payload.get(
                    "ignored_same_bar_as_stop", [])
                updates["r_multiple"] = payload.get("r_multiple")
                for k in ("r_gross", "r_cost", "r_net", "r_detail"):
                    if k in payload:
                        updates[k] = payload[k]
        record.update(updates)
        append_grade(record)
        current.add(sid)
        counts["corrections"] += 1
        key = f"correction:{updates['entry_class']}"
        by_class[key] = by_class.get(key, 0) + 1


def main() -> int:
    os.makedirs(CACHE, exist_ok=True)
    first_seen, latest_status = load_ledger()
    prior, mid, current = load_grade_records()
    now = utcnow()
    counts = {"graded": 0, "still_open": 0, "deferred": 0,
              "corrections": 0, "corrections_deferred": 0}
    by_class = {}
    detail_fetches = 0

    # Pass 1: v1.2 corrections — re-label any v1 grade the v1.1 pass has
    # not reached, and supersede the entry basis of any v1.1 record that
    # claims prospective_entry (modeled entry).
    append_corrections(first_seen, prior, mid, current, now, counts,
                       by_class)

    # Pass 2: fresh grades for signals with no grade under any version.
    for sid, rec in first_seen.items():
        if sid in current or sid in mid or sid in prior:
            continue
        created = parse_ts(rec["vendor_created_at"])
        tf_secs = timeframe_seconds(rec.get("timeframe"))
        if tf_secs is None:
            append_grade({
                "record_type": "grade", "signal_id": sid,
                "grader_version": GRADER_VERSION, "graded_at": iso(now),
                "outcome_class": "unverifiable",
                "unverifiable_reason": f"unknown timeframe {rec.get('timeframe')!r}",
                "maturity": "n/a",
                "entry_class": "unverifiable",
            })
            current.add(sid)
            counts["graded"] += 1
            by_class["unverifiable"] = by_class.get("unverifiable", 0) + 1
            continue
        horizon_close = created + timedelta(seconds=24 * tf_secs)
        first_seen_at = parse_ts(rec["snapshot_at"])
        maturity = ("prospective" if first_seen_at <= horizon_close
                    else "retrospective_context")
        vendor_status = latest_status.get(sid)

        base = {
            "record_type": "grade",
            "signal_id": sid,
            "grader_version": GRADER_VERSION,
            "graded_at": iso(now),
            "maturity": maturity,
            "symbol": rec.get("symbol"),
            "side": rec.get("side"),
            "timeframe": rec.get("timeframe"),
            "vendor_created_at": rec.get("vendor_created_at"),
            "first_seen_at": rec.get("snapshot_at"),
            "horizon_close": iso(horizon_close),
            "entry_price": rec.get("entry_price"),
            "levels": rec.get("levels"),
            "vendor_status_latest": vendor_status,
            "evidence_source": "binance_usdm_futures_1m_daily_archive",
        }

        if vendor_status == "profit_locked":
            # Vendor-reported exit class: its own class, never a target win,
            # never a loss. Gradeable on the vendor's documented exit; the
            # exit claim itself stays flagged vendor-reported.
            if detail_fetches >= MAX_DETAIL_FETCHES_PER_RUN:
                counts["deferred"] += 1
                continue
            detail_fetches += 1
            claim = vendor_exit_claim(sid)
            if claim is None:
                counts["deferred"] += 1
                continue
            vendor_exit_at = (parse_ts(claim["at"])
                              if claim.get("at") else None)
            entry_class, facts = compute_eligibility(
                rec, horizon_close, vendor_exit_at)
            if entry_class == "defer":
                counts["deferred"] += 1
                continue
            record = dict(base)
            record.update({
                "outcome_class": "vendor_profit_locked",
                "entry_class": entry_class,
                "eligibility": facts,
                "vendor_exit_claim": claim,
                "r_multiple": None,
                "vendor_agrees": None,
                "notes": "Vendor-reported exit class kept separate by rule; "
                         "not counted as a target win or as a loss.",
            })
            if entry_class == "prospective_entry":
                # v1.2: record the modeled entry for a prospective row.
                # The vendor-class grade itself does not wait on the
                # archive: an unpublished entry bar is noted, not deferred.
                me_status, me_facts = modeled_entry(rec)
                public = {k: v for k, v in me_facts.items()
                          if k != "bar_open_ms"}
                if me_status == "ok":
                    record["modeled_entry"] = public
                elif me_status == "unavailable":
                    record["modeled_entry"] = public
                    record["entry_class"] = "modeled_entry_unavailable"
                else:
                    record["modeled_entry"] = None
                    record["modeled_entry_defer_reason"] = me_facts.get(
                        "defer_reason")
            if now >= horizon_close:
                status, detail = reconstruct(rec, horizon_close, now)
                if status == "decisive":
                    record["reconstruction_at_horizon"] = detail
            append_grade(record)
            current.add(sid)
            counts["graded"] += 1
            by_class["vendor_profit_locked"] = \
                by_class.get("vendor_profit_locked", 0) + 1
            continue

        horizon_closed = now >= horizon_close
        if not horizon_closed and vendor_status not in VENDOR_EXIT_STATES:
            counts["still_open"] += 1
            continue

        entry_class, facts = compute_eligibility(rec, horizon_close, None)
        if entry_class == "defer":
            counts["deferred"] += 1
            continue
        # v1.2 modeled entry: a prospective row is measured from the first
        # futures 1m bar at/after first_seen, never from the vendor's
        # advertised entry. An unpublished entry bar defers the grade.
        me_facts = None
        scan_start = None
        if entry_class == "prospective_entry":
            me_status, me_facts = modeled_entry(rec)
            if me_status == "defer":
                counts["deferred"] += 1
                continue
            if me_status == "unavailable":
                entry_class = "modeled_entry_unavailable"
            else:
                scan_start = me_facts["bar_open_ms"]

        status, detail = reconstruct(rec, horizon_close, now,
                                     start_override_ms=scan_start)
        if status == "still_open":
            counts["still_open"] += 1
            continue
        if status == "defer":
            counts["deferred"] += 1
            continue
        record = dict(base)
        record.update({"entry_class": entry_class, "eligibility": facts})
        if me_facts is not None:
            record["modeled_entry"] = {
                k: v for k, v in me_facts.items() if k != "bar_open_ms"}
        if status == "unverifiable":
            record.update({
                "outcome_class": "unverifiable",
                "unverifiable_reason": detail.get("reason"),
                "r_multiple": None,
                "vendor_agrees": None,
            })
            by_class["unverifiable"] = by_class.get("unverifiable", 0) + 1
        else:
            outcome = detail["outcome_class"]
            record.update({
                "outcome_class": outcome,
                "touches": detail.get("touches", {}),
                "ignored_same_bar_as_stop": detail.get(
                    "ignored_same_bar_as_stop", []),
                "vendor_agrees": (vendor_status == outcome)
                                 if vendor_status in VENDOR_EXIT_STATES
                                 else None,
            })
            if entry_class == "prospective_entry":
                pr = prospective_r(outcome, me_facts["price"],
                                   rec.get("levels", {}), rec["side"])
                if pr is not None:
                    record["r_gross"] = pr["gross"]
                    record["r_cost"] = pr["cost"]
                    record["r_net"] = pr["net"]
                    record["r_detail"] = pr
                    record["r_multiple"] = pr["gross"]
                else:
                    record["r_multiple"] = None
            else:
                record["r_multiple"] = r_multiple(rec, outcome)
            by_class[outcome] = by_class.get(outcome, 0) + 1
        append_grade(record)
        current.add(sid)
        counts["graded"] += 1

    print(f"grade ok at {iso(now)}: {counts['corrections']} corrections, "
          f"{counts['graded']} graded {by_class}, "
          f"{counts['still_open']} still open (not graded), "
          f"{counts['deferred']} deferred, "
          f"{counts['corrections_deferred']} corrections deferred")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
