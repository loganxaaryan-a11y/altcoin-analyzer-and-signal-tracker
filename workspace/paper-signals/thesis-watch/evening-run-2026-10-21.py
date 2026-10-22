#!/usr/bin/env python3
"""Thesis-watcher evening run 2026-10-21: recompute crypto transitions, pre-commit alerts, update state.

EQUITY TERMINAL SKIPPED: altcoin-analyzer-and-signal-tracker listtheories/getmarketread OK.
equity-analyzer-and-signal-tracker timed out on all 4 action attempts (listtheories x3, getmarketread
x1) - space worker request timed out after 120000ms each. Per body section 2: logged in run log,
equity state rows left untouched, no fabrication.
"""
import json, os, re, copy
from datetime import datetime, timezone

RUN_TS = "2026-10-21T23:56:37Z"          # this run's start (UTC)
RUN_DATE = "2026-10-21"
TS = "20261021T235637Z"                  # compact file convention
CLASSIFY_OBS_UTC = "2026-10-22T00:07:24.527Z"  # crypto getmarketread asOf
BASE = os.path.expanduser("~/workspace/goals/research-terminal/paper-signals/thesis-watch")
WR = os.path.join(BASE, "worker-runs")
os.makedirs(WR, exist_ok=True)

def load(p):
    with open(p) as f: return json.load(f)

def save(p, obj):
    with open(p, "w") as f: json.dump(obj, f, indent=1, ensure_ascii=False)

state = load(os.path.join(BASE, "theory-state.json"))
ledger = load(os.path.join(BASE, "alert-ledger.json"))

crypto_theories_raw = load(os.path.join(WR, f"listtheories-crypto-{TS}.json"))
crypto_theories = {str(t["id"]): t for t in crypto_theories_raw["theories"]}

print("crypto theories seen:", sorted(crypto_theories, key=int))

# ---- crypto prices: getmarketread rows first, prediction feed fallback ----
CRYPTO_PRICES = {
    "BTC": 84219.31962674865,
    "ETH": 2477.153547765903,
    "SOL": 107.23160232125046,
    "LINK": 12.534909172767376,
    "HYPE": 81.01548391536186,
    "SUI": 1.0325573867298097,
}
CRYPTO_TS = "2026-10-22T00:07:24.527Z"   # getmarketread asOf (data timestamp)
CRYPTO_BREADTH_15 = 0                     # 0% of covered assets positive over 15d -> regime risk-off
CRYPTO_CATS_ALL_BEARISH = False

alerts_due = []
run_notes = []
learning_new = []
bounce_newly_opened = []

def hit(direction, price, level):
    return (price >= level) if direction == "above" else (price <= level)

def progress(direction, now, base, level):
    try:
        return ((now - base) / (level - base) * 100) if direction == "above" else ((base - now) / (base - level) * 100)
    except ZeroDivisionError:
        return 0.0

def due_key(slug, tid, transition):
    return f"{slug}/{tid}/{transition}"

def precommit(slug, tid, name, transition, level, price, data_ts):
    key = due_key(slug, tid, transition)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    entry = {
        "status": "awaiting-ack",
        "attempts": (ledger["entries"][key].get("attempts", 0) + 1) if key in ledger["entries"] else 1,
        "sent_at_utc": now,
        "run_ts_utc": RUN_TS,
        "terminal": slug,
        "theory_id": int(tid),
        "theory_name": name,
        "transition": transition,
        "tripwire_level": level,
        "current_price": price,
        "data_timestamp_utc": data_ts,
    }
    if key in ledger["entries"]:
        e = ledger["entries"][key]
        if e.get("status") == "delivered":
            return False  # forever suppressed
        # re-occurrence of the same transition: refresh the awaiting-ack entry (§5)
        e.update(entry)
        alerts_due.append({"key": key, "slug": slug, "tid": tid, "name": name,
                           "transition": transition, "level": level, "price": price,
                           "refreshed": True})
        return True
    ledger["entries"][key] = entry
    alerts_due.append({"key": key, "slug": slug, "tid": tid, "name": name,
                       "transition": transition, "level": level, "price": price})
    return True

def crypto_price_fn(ft, p, ticker):
    if ticker in CRYPTO_PRICES:
        return CRYPTO_PRICES[ticker], "getmarketread"
    px = p.get("current")
    return (px, "listtheories prediction feed") if px is not None else (None, None)

def process_terminal(slug, short, fresh, price_fn, data_ts):
    st = state["terminals"][slug]
    st_theories = st["theories"]
    for tid, ft in fresh.items():
        fstatus = ft.get("status")
        fname = ft.get("statement") or ft.get("name") or f"theory {tid}"
        if tid not in st_theories:
            # NEW theory -> baseline silently
            preds = {}
            for p in ft.get("predictions", []):
                ticker = p.get("ticker") or p.get("symbol")
                px, _src = price_fn(ft, p, ticker)
                lvl = p.get("targetLevel") or p.get("targetPrice")
                d = p.get("direction")
                tw = "hit" if (px is not None and lvl is not None and hit(d, px, lvl)) else "unhit"
                preds[f"p{p['id']}"] = {
                    "ticker": ticker, "direction": d, "target_level": lvl,
                    "due_date": p.get("dueDate"), "baseline_price": px,
                    "current_price": px, "tripwire_state": tw,
                    "progress_pct": progress(d, px, px, lvl) if px is not None and lvl is not None else None,
                    "terminal_pred_id": p["id"], "baselined_at_first_run": True,
                    "note": "new theory first seen 2026-10-21 evening run; baselined silently, never alerted on first sight",
                }
            ev_inv = [{"id": e["id"], "stance": e.get("stance")} for e in ft.get("evidence", [])]
            st_theories[tid] = {
                "theory_id": int(tid), "name": fname, "status": fstatus,
                "coverage": "full", "evidence_baselined": True,
                "evidence_inventory": ev_inv,
                "note": "new theory first seen 2026-10-21 evening run; baselined silently, never alerted on first sight",
                "baseline_prices": {}, "current_prices": {},
                "price_source": {}, "data_timestamp_utc": data_ts,
                "last_checked_utc": RUN_TS, "missing_since": None,
                "predictions": preds,
            }
            run_notes.append(f"{short}/{tid}: NEW theory baselined silently (status {fstatus}, {len(preds)} predictions)")
            continue
        row = st_theories[tid]
        # (a) status transition
        old_status = row.get("status")
        if old_status != fstatus:
            tr = f"status:{old_status}\u2192{fstatus}"
            if precommit(slug, tid, row.get("name", fname), tr, None, None, data_ts):
                run_notes.append(f"{short}/{tid}: STATUS {old_status} -> {fstatus} (alerted)")
            else:
                run_notes.append(f"{short}/{tid}: STATUS {old_status} -> {fstatus} (already delivered, no re-alert)")
            row["status"] = fstatus
        # (d) evidence: only on confirming theories
        if row.get("status") == "confirming":
            old_ids = {e["id"]: e.get("stance") for e in row.get("evidence_inventory", [])}
            new_items = []
            for e in ft.get("evidence", []):
                if e["id"] not in old_ids:
                    new_items.append(e)
                    if e.get("stance") == "challenging":
                        tr = "new-challenging-evidence"
                        if precommit(slug, tid, row.get("name", fname), tr, None, None, data_ts):
                            run_notes.append(f"{short}/{tid}: NEW challenging evidence id {e['id']} (alerted)")
                        else:
                            run_notes.append(f"{short}/{tid}: NEW challenging evidence id {e['id']} (delivered key exists, no re-alert)")
                    else:
                        run_notes.append(f"{short}/{tid}: new {e.get('stance')} evidence id {e['id']} baselined silently")
            if new_items:
                row["evidence_inventory"] = row.get("evidence_inventory", []) + [
                    {"id": e["id"], "stance": e.get("stance")} for e in new_items]
        # (b) predictions
        for p in ft.get("predictions", []):
            ticker = p.get("ticker") or p.get("symbol")
            lvl = p.get("targetLevel") or p.get("targetPrice")
            d = p.get("direction")
            pid = p["id"]
            skey = None
            for k, v in row["predictions"].items():
                if v.get("terminal_pred_id") == pid:
                    skey = k; break
            px, psrc = price_fn(ft, p, ticker)
            if skey is None:
                # new prediction on known theory -> baseline silently
                n = max([int(re.sub(r"\D", "", k) or 0) for k in row["predictions"]] + [0]) + 1
                skey = f"p{n}"
                tw = "hit" if (px is not None and lvl is not None and hit(d, px, lvl)) else "unhit"
                row["predictions"][skey] = {
                    "ticker": ticker, "direction": d, "target_level": lvl,
                    "due_date": p.get("dueDate"), "baseline_price": px, "current_price": px,
                    "tripwire_state": tw,
                    "progress_pct": progress(d, px, px, lvl) if px is not None and lvl is not None else None,
                    "terminal_pred_id": pid, "baselined_at_first_run": True,
                    "note": "new prediction first seen 2026-10-21 evening run; baselined silently, never alerted",
                }
                run_notes.append(f"{short}/{tid}/{skey}: new prediction baselined silently (terminal id {pid})")
                continue
            sp = row["predictions"][skey]
            old_tw = sp.get("tripwire_state")
            base = sp.get("baseline_price")
            new_tw = old_tw
            if px is None:
                run_notes.append(f"{short}/{tid}/{skey} {ticker}: price unavailable this run")
            else:
                new_tw = "hit" if hit(d, px, lvl) else "unhit"
                if old_tw == "unhit" and new_tw == "hit":
                    tr = f"tripwire:{skey}:hit"
                    if precommit(slug, tid, row.get("name", fname), tr, lvl, px, data_ts):
                        run_notes.append(f"{short}/{tid}/{skey}: TRIPWIRE BREAK {d} {lvl} ({ticker} {px}) alerted")
                    else:
                        run_notes.append(f"{short}/{tid}/{skey}: TRIPWIRE BREAK delivered key exists, no re-alert")
                    sp["tripwire_hit_observed_utc"] = CLASSIFY_OBS_UTC
                elif old_tw == "hit" and new_tw == "unhit" and not sp.get("resolved"):
                    # level lost after a hit: only an ALERTED hit flips state / opens a bounce watch (§7).
                    # A silent-baseline hit stays "hit" as the historical record; price moving back
                    # across never generates a transition.
                    key = due_key(slug, tid, f"tripwire:{skey}:hit")
                    was_alerted = key in ledger["entries"]
                    if not was_alerted:
                        new_tw = "hit"
                        run_notes.append(f"{short}/{tid}/{skey}: price back across level but hit was silent baseline -> stays 'hit', no transition")
                    else:
                        new_tw = "unhit"
                        if "bounce_watch" not in sp:
                            sp["bounce_watch"] = {
                                "reclaimed_level": lvl, "reclaimed_at_utc": CLASSIFY_OBS_UTC,
                                "reclaim_price": px,
                                "reclaim_context": {"volume_note": None, "funding_note": None, "breadth_note": None},
                                "classify_after_utc": "2026-10-27T00:07:00Z",
                                "status": "open",
                                "note": f"hit alerted ({key}); level reclaimed 2026-10-21 evening run",
                            }
                            bounce_newly_opened.append(f"{short}/{tid}/{skey} {ticker}")
                            run_notes.append(f"{short}/{tid}/{skey}: level LOST after alerted hit -> bounce watch opened (classify after 2026-10-27T00:07:00Z)")
                        else:
                            run_notes.append(f"{short}/{tid}/{skey}: level still lost; bounce watch already open")
                sp["tripwire_state"] = new_tw
                sp["current_price"] = px
                sp["progress_pct"] = progress(d, px, base, lvl) if base is not None else None
                if ticker:
                    row.setdefault("current_prices", {})[ticker] = px
                    row.setdefault("price_source", {})[ticker] = psrc
            # (c) expiry / invalidation
            if not sp.get("resolved"):
                due = sp.get("due_date")
                term_invalid = str(p.get("status", "")).lower() in ("invalidated", "refuted")
                expired = due is not None and due < RUN_DATE
                if term_invalid or expired:
                    kind = "invalidated" if term_invalid else "expired"
                    tr = f"{kind}:{skey}"
                    already = due_key(slug, tid, tr) in ledger["entries"]
                    # a sibling key (invalidated vs expired) for the same prediction also suppresses
                    sibling = due_key(slug, tid, f"{'expired' if kind=='invalidated' else 'invalidated'}:{skey}")
                    if not already and sibling in ledger["entries"]:
                        already = True
                    raw_ret = None
                    if base is not None and px is not None and base:
                        raw_ret = (px - base) / base * 100
                    btc_base = row.get("baseline_prices", {}).get("BTC")
                    btc_now = CRYPTO_PRICES["BTC"]
                    if already:
                        run_notes.append(f"{short}/{tid}/{skey}: resolved already surfaced in ledger; marking resolved, no new alert")
                    else:
                        precommit(slug, tid, row.get("name", fname), tr, lvl, px, data_ts)
                        run_notes.append(f"{short}/{tid}/{skey}: RESOLVED ({kind}) alerted")
                    regime = "risk-off" if (CRYPTO_BREADTH_15 < 10 or CRYPTO_CATS_ALL_BEARISH) else "normal"
                    btc_ret = ((btc_now - btc_base) / btc_base * 100) if btc_base else None
                    learning_new.append({
                        "resolved_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "terminal": slug, "theory_id": int(tid),
                        "theory_name": row.get("name", fname), "prediction_key": skey,
                        "ticker": ticker, "direction": d, "target_level": lvl,
                        "due_date": due, "outcome": "invalidated" if term_invalid else "miss",
                        "raw_return_pct": raw_ret, "benchmark": "BTC",
                        "benchmark_return_pct": btc_ret,
                        "beta_adjusted_return_pct": (raw_ret - btc_ret) if (raw_ret is not None and btc_ret is not None) else None,
                        "regime": regime,
                        "regime_inputs": {"breadth_15d_pct": CRYPTO_BREADTH_15,
                                          "categories_all_bearish": CRYPTO_CATS_ALL_BEARISH,
                                          **({"benchmark_unavailable": True} if btc_ret is None else {})},
                        "bounce_fakeout": None,
                    })
                    sp["resolved"] = True
        row["data_timestamp_utc"] = data_ts
        row["last_checked_utc"] = RUN_TS
        row["missing_since"] = None
    # (f) missing theories
    for tid, row in st_theories.items():
        if tid not in fresh:
            if row.get("missing_since"):
                run_notes.append(f"{short}/{tid}: still missing (since {row['missing_since']})")
            else:
                row["missing_since"] = RUN_TS
                run_notes.append(f"{short}/{tid}: absent from listtheories this run -> flagged missing_since")

process_terminal("altcoin-analyzer-and-signal-tracker", "Crypto", crypto_theories, crypto_price_fn, CRYPTO_TS)

# ---- learning ledger appends ----
if learning_new:
    with open(os.path.join(BASE, "learning-ledger.jsonl"), "a") as f:
        for e in learning_new:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")

# ---- ledger write (one write) ----
save(os.path.join(BASE, "alert-ledger.json"), ledger)

# ---- run log ----
finished = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
runlog = {
    "invocation_completed": {
        "run_ts_utc": RUN_TS, "started_utc": RUN_TS, "finished_utc": finished,
        "status": "succeeded",
        "per_terminal_fetch": {
            "altcoin-analyzer-and-signal-tracker": {
                "listtheories": "ok (14 theories)",
                "getmarketread": f"ok, asOf {CRYPTO_TS}; ZEC/AAVE/PENDLE/NEAR absent from rows -> prediction-feed prices used",
            },
            "equity-analyzer-and-signal-tracker": {
                "listtheories": "FAILED: 3 attempts, space worker request timed out after 120000ms each",
                "getmarketread": "FAILED: 1 attempt, space worker request timed out after 120000ms",
                "note": "terminal-side infrastructure failure; equity state rows untouched this run, no fabrication; retry next run",
            },
        },
        "theories_seen": {"crypto": len(crypto_theories), "equity": 0},
        "transitions_found": len(alerts_due),
        "alerts_pre_committed": [a["key"] for a in alerts_due],
        "learning_entries_appended": len(learning_new),
        "bounce_watches_opened": bounce_newly_opened,
        "errors": ["equity-analyzer-and-signal-tracker: all action attempts timed out (4x120s); side skipped per body section 2"],
        "notes": run_notes,
    },
    "scheduler_provenance": {"origin_unverified": True},
}
save(os.path.join(WR, f"run-{TS}.json"), runlog)

# ---- state write ----
save(os.path.join(BASE, "theory-state.json"), state)

# ---- prune worker-runs to last 20 (instant-parsed, 5 conventions; unparseable kept) ----
def parse_ts(fn):
    m = re.search(r"(\d{8}T\d{12}Z)", fn)
    if m: return datetime.strptime(m.group(1), "%Y%m%dT%H%M%S%fZ").replace(tzinfo=timezone.utc)
    m = re.search(r"(\d{8}T\d{6}Z)", fn)
    if m: return datetime.strptime(m.group(1), "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    m = re.search(r"(\d{8}T\d{4}Z)", fn)
    if m: return datetime.strptime(m.group(1), "%Y%m%dT%H%MZ").replace(tzinfo=timezone.utc)
    m = re.search(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)", fn)
    if m: return datetime.strptime(m.group(1), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    m = re.search(r"(\d{4}-\d{2}-\d{2}T\d{4}Z)", fn)
    if m: return datetime.strptime(m.group(1), "%Y-%m-%dT%H%MZ").replace(tzinfo=timezone.utc)
    return None
files = [f for f in os.listdir(WR) if f.endswith(".json")]
parsed = [(parse_ts(f), f) for f in files]
unparseable = [f for dt, f in parsed if dt is None]
parsed.sort(key=lambda x: x[0] or datetime.min.replace(tzinfo=timezone.utc))
keep = {f for _, f in parsed[-20:]} | set(unparseable)
deleted = []
for _, f in parsed:
    if f not in keep:
        os.remove(os.path.join(WR, f)); deleted.append(f)
print("pruned:", deleted)
print("unparseable kept:", unparseable)
print("alerts due:", len(alerts_due))
for a in alerts_due:
    print(" -", a["key"], "(refreshed)" if a.get("refreshed") else "")
print("learning new:", len(learning_new))
print("bounce watches opened:", bounce_newly_opened)
print("run notes:")
for n in run_notes:
    print(" *", n)
