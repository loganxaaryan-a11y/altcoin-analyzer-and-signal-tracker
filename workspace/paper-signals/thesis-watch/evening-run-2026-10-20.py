#!/usr/bin/env python3
"""Thesis-watcher evening run 2026-10-20: recompute transitions, pre-commit alerts, update state."""
import json, os, re, copy
from datetime import datetime, timezone

RUN_TS = "2026-10-20T23:56:30Z"
RUN_DATE = "2026-10-20"
CLASSIFY_AFTER = "2026-10-20T23:59:33Z"
TS = "20261020T235630Z"
BASE = os.path.expanduser("~/workspace/goals/research-terminal/paper-signals/thesis-watch")
TO = os.path.expanduser("~/workspace/agents/cd566fc0-ef1e-4bad-8456-078bed6a07c7/tool-output")
WR = os.path.join(BASE, "worker-runs")
os.makedirs(WR, exist_ok=True)

def load(p):
    with open(p) as f: return json.load(f)

def save(p, obj):
    with open(p, "w") as f: json.dump(obj, f, indent=1, ensure_ascii=False)

state = load(os.path.join(BASE, "theory-state.json"))
ledger = load(os.path.join(BASE, "alert-ledger.json"))

# ---- raw responses -> worker-runs ----
def extract(fname):
    d = load(os.path.join(TO, fname))
    return d["data"]

crypto_theories_raw = extract("artifact.invoke_action-call_01a15bbf34d475f59ae5a6f373dbf139.json")
eq_p1 = extract("artifact.invoke_action-call_01a15bbf393570f390a3918d7b24e3da.json")
eq_p2 = extract("artifact.invoke_action-call_01a15bc2ee1370b38fb4b7aefc1decaf.json")
eq_p3 = extract("artifact.invoke_action-call_01a15bc4104c70a2a7bb1edd766dc007.json")

save(os.path.join(WR, f"listtheories-crypto-{TS}.json"), crypto_theories_raw)
save(os.path.join(WR, f"listtheories-equity-{TS}.json"), eq_p1)
save(os.path.join(WR, f"listtheories-equity-page2-{TS}.json"), eq_p2)
save(os.path.join(WR, f"listtheories-equity-page3-{TS}.json"), eq_p3)

crypto_theories = {str(t["id"]): t for t in crypto_theories_raw["theories"]}
eq_theories = {}
for pg in (eq_p1, eq_p2, eq_p3):
    for t in pg["theories"]:
        eq_theories[str(t["id"])] = t

print("crypto theories seen:", sorted(crypto_theories, key=int))
print("equity theories seen:", sorted(eq_theories, key=int))

# ---- prices ----
# crypto getmarketread #2 (post-classification-cutoff), asOf 2026-10-21T00:05:47.788Z
CRYPTO_PRICES = {"BTC": 82878.12564691149, "ETH": 2444.371561824189,
                 "SOL": 106.3065287785411, "LINK": 12.30378140534452,
                 "HYPE": 80.29807602021484}
CRYPTO_TS = "2026-10-21T00:05:47.788Z"
CLASSIFY_OBS_UTC = "2026-10-21T00:05:47.788Z"  # post cutoff
EQ_TS = "2026-10-20T23:58:19.766Z"  # equity getmarketread refreshedAt (session-close cache)

alerts_due = []       # list of dicts
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
    if key in ledger["entries"]:
        e = ledger["entries"][key]
        if e.get("status") == "delivered":
            return False  # forever suppressed
        # re-occurrence of the same transition: refresh the awaiting-ack entry (§5)
        e["status"] = "awaiting-ack"
        e["attempts"] = e.get("attempts", 0) + 1
        e["sent_at_utc"] = now
        e["run_ts_utc"] = RUN_TS
        e["tripwire_level"] = level
        e["current_price"] = price
        e["data_timestamp_utc"] = data_ts
        alerts_due.append({"key": key, "slug": slug, "tid": tid, "name": name,
                           "transition": transition, "level": level, "price": price,
                           "refreshed": True})
        return True
    ledger["entries"][key] = {
        "status": "awaiting-ack",
        "attempts": 1,
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
    alerts_due.append({"key": key, "slug": slug, "tid": tid, "name": name,
                       "transition": transition, "level": level, "price": price})
    return True

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
                    "note": "new theory first seen 2026-10-20 evening run; baselined silently, never alerted on first sight",
                }
            ev_inv = [{"id": e["id"], "stance": e.get("stance")} for e in ft.get("evidence", [])]
            st_theories[tid] = {
                "theory_id": int(tid), "name": fname, "status": fstatus,
                "coverage": "full", "evidence_baselined": True,
                "evidence_inventory": ev_inv,
                "note": "new theory first seen 2026-10-20 evening run; baselined silently, never alerted on first sight",
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
                run_notes.append(f"{short}/{tid}: STATUS {old_status} -> {fstatus} (already in ledger, no re-alert)")
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
                            run_notes.append(f"{short}/{tid}: NEW challenging evidence id {e['id']} (already in ledger)")
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
            # match state prediction by terminal_pred_id
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
                    "note": "new prediction first seen 2026-10-20 evening run; baselined silently, never alerted",
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
                        run_notes.append(f"{short}/{tid}/{skey}: TRIPWIRE BREAK already in ledger, no re-alert")
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
                                "classify_after_utc": "2026-10-26T00:06:00Z",
                                "status": "open",
                                "note": f"hit alerted ({key}); level reclaimed 2026-10-20 evening run",
                            }
                            bounce_newly_opened.append(f"{short}/{tid}/{skey} {ticker}")
                            run_notes.append(f"{short}/{tid}/{skey}: level LOST after alerted hit -> bounce watch opened (classify after 2026-10-26T00:06:00Z)")
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
                    if already:
                        run_notes.append(f"{short}/{tid}/{skey}: resolved already surfaced in ledger; marking resolved, no new alert")
                    else:
                        precommit(slug, tid, row.get("name", fname), tr, lvl, px, data_ts)
                        run_notes.append(f"{short}/{tid}/{skey}: RESOLVED ({kind}) alerted")
                        learning_new.append({"terminal": slug, "theory_id": int(tid),
                            "theory_name": row.get("name", fname), "prediction_key": skey,
                            "ticker": ticker, "direction": d, "target_level": lvl,
                            "due_date": due, "outcome": "invalidated" if term_invalid else "miss",
                            "first_price": base, "resolution_price": px})
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

def crypto_price_fn(ft, p, ticker):
    if ticker in CRYPTO_PRICES:
        return CRYPTO_PRICES[ticker], "getmarketread"
    px = p.get("current")
    return (px, "listtheories prediction feed") if px is not None else (None, None)

def eq_price_fn(ft, p, ticker):
    px = p.get("currentPrice")
    return (px, "listtheories prediction feed") if px is not None else (None, None)

process_terminal("altcoin-analyzer-and-signal-tracker", "Crypto", crypto_theories, crypto_price_fn, CRYPTO_TS)
process_terminal("equity-analyzer-and-signal-tracker", "Equity", eq_theories, eq_price_fn, EQ_TS)

# ---- bounce-watch classifications due tonight (after CLASSIFY_AFTER) ----
def classify(tid_slug, theory_id, skey, price, level, rebreached, history_note):
    row = state["terminals"][tid_slug]["theories"][theory_id]["predictions"][skey]
    bw = row.get("bounce_watch")
    if not bw or bw.get("status") != "open":
        run_notes.append(f"{tid_slug}/{theory_id}/{skey}: no open bounce watch to classify")
        return
    final = "fakeout" if rebreached else "bounce-held"
    bw["status"] = "closed"
    bw["final"] = final
    bw["classified_at_utc"] = CLASSIFY_OBS_UTC
    bw["classification_price"] = price
    bw["classification_note"] = history_note
    run_notes.append(f"{tid_slug}/{theory_id}/{skey}: bounce watch CLOSED -> {final} (price {price} vs level {level})")

# crypto 6/p2: BTC below 81000; re-breach = back below 81000 within 5d -> never happened
classify("altcoin-analyzer-and-signal-tracker", "6", "p2", CRYPTO_PRICES["BTC"], 81000.0, False,
         "BTC never re-breached below 81000 in the 5-day window (held 81413-82982); reclaim held -> bounce-held")
# crypto 9/p1: BTC below 81685.89; re-breached below on 10-17 (81473/81413) and 10-20 morning (81416) -> fakeout
classify("altcoin-analyzer-and-signal-tracker", "9", "p1", CRYPTO_PRICES["BTC"], 81685.89, True,
         "level re-breached below 81685.89 within window (10-17 ~81473/81413, 10-20 morning 81416); above at classification (82878) but re-breach already occurred -> fakeout")
# equity 3/p1: NVDA above 217.61; re-breach = back above 217.61 within 5d -> never happened (216.47 tonight)
nvda = eq_theories.get("3", {}).get("predictions", [{}])
nvda_px = None
for p in eq_theories.get("3", {}).get("predictions", []):
    if p.get("id") == 3:
        nvda_px = p.get("currentPrice")
classify("equity-analyzer-and-signal-tracker", "3", "p1", nvda_px, 217.61, False,
         "NVDA never reclaimed above 217.61 in the 5-day window (216.47 at close 10-20); move away from level held -> bounce-held per §7 (re-breached within 5d -> fakeout; else bounce-held)")

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
            "altcoin-analyzer-and-signal-tracker": {"listtheories": "ok", "getmarketread": "ok (2 reads; post-cutoff read used for tripwires/classification)"},
            "equity-analyzer-and-signal-tracker": {"listtheories": "ok (3 pages, cursor 0/20/40)", "getmarketread": "ok (cached session-close history; prices from prediction feed)"},
        },
        "theories_seen": {"crypto": len(crypto_theories), "equity": len(eq_theories)},
        "transitions_found": len(alerts_due),
        "alerts_precommitted": [a["key"] for a in alerts_due],
        "bounce_watches_closed": 3,
        "bounce_watches_opened": bounce_newly_opened,
        "learning_entries_appended": len(learning_new),
        "errors": [],
        "notes": run_notes,
    },
    "scheduler_provenance": {"origin_unverified": True},
}
save(os.path.join(WR, f"run-{TS}.json"), runlog)

# ---- state write ----
save(os.path.join(BASE, "theory-state.json"), state)

# ---- prune worker-runs to last 20 (instant-parsed, 3 conventions) ----
def parse_ts(fn):
    m = re.search(r"(\d{8}T\d{12}Z)", fn)
    if m: return datetime.strptime(m.group(1), "%Y%m%dT%H%M%S%fZ").replace(tzinfo=timezone.utc)
    m = re.search(r"(\d{8}T\d{6}Z)", fn)
    if m: return datetime.strptime(m.group(1), "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    m = re.search(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)", fn)
    if m: return datetime.strptime(m.group(1), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
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
    print(" -", a["key"])
print("learning new:", len(learning_new))
print("run notes:")
for n in run_notes:
    print(" *", n)
