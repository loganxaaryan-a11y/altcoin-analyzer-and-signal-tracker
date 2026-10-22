#!/usr/bin/env python3
"""C-2 'crypto-dossier-minus-momentum' shadow-scoring harness (2026-10-13).

READ-ONLY. Does not write to any production table and does not touch the
Phase 2A holdout. Reads only the local workspace DB copy.

Pipeline per generated_signals row:
  1. Reproduce production from the persisted factors_json ledger
     (dropping the legacy 'Walk-forward base rate' extra factor).
     Rows that do not reproduce exactly are marked and skipped.
  2. Compute the C-2 score: drop the 'Momentum' factor (contribution AND
     its weight 1.5 from the denominator; remaining weights not rescaled),
     challengerLong = round(clamp(50 + (net/15.5)*42, 5, 95)),
     challengerShort = 100 - challengerLong,
     direction = challengerLong >= challengerShort ? long : short.
  3. Mirror levels/gates to the challenger direction (spec section 2):
     invalidation = entry -/+ 1.25*ATR14; targets entry +/-1.5R/+/-2.5R.
     born-dead mirror attempted from signal_input_snapshots (signal-day
     OHLC matched by asset+day); if unrecoverable -> UNRECOVERABLE.
     short-regime gate -> UNVERIFIABLE-HISTORICAL (inputs not persisted).

Output: c2-shadow-ledger-2026-10-13.csv + stdout summary.
"""
import sqlite3, json, math, csv, sys

DB = '/home/hatch/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/app.db'
OUT = '/home/hatch/workspace/goals/research-terminal/paper-signals/research/c2-shadow-ledger-2026-10-13.csv'

WF_LABELS = ('walk-forward base rate',)
MOMENTUM_LABELS = ('momentum',)  # dossier Momentum (RSI-14) factor

def score_factors(factors, drop=()):
    usable = [f for f in factors
              if f.get('weight', 0) > 0
              and math.isfinite(f.get('contribution', 0))
              and f.get('label') not in drop]
    wn = sum(f['contribution'] for f in usable)
    tw = sum(f['weight'] for f in usable)
    ls = round(max(5, min(95, 50 + (wn / tw) * 42 if tw > 0 else 50)))
    ss = 100 - ls
    return {'longScore': ls, 'shortScore': ss, 'weightedNet': wn,
            'totalWeight': tw, 'direction': 'long' if ls >= ss else 'short'}

def is_momentum(f):
    return f.get('label') == 'Momentum'

con = sqlite3.connect('file:' + DB + '?mode=ro', uri=True)
rows = con.execute(
    'select id, coin_id, symbol, direction, confidence, entry, invalidation, '
    'target1, target2, atr14, factors_json, created_at '
    'from generated_signals order by id').fetchall()

# signal-day OHLC recovery: snapshot payload -> candle{day,high,low}, by asset
snaps = []
for (asset, payload) in con.execute(
        "select asset_id, payload_json from signal_input_snapshots"):
    try:
        p = json.loads(payload)
        c = p.get('candle') or {}
        if c.get('day') and c.get('high') is not None and c.get('low') is not None:
            snaps.append((asset, c['day'], float(c['high']), float(c['low'])))
    except Exception:
        pass

out_rows = []
for (rid, coin_id, sym, dirc, conf, entry, inval, t1, t2, atr14,
     fj, created_at) in rows:
    factors = json.loads(fj)
    wf = [f['label'] for f in factors
          if f.get('label') and f['label'].lower() in WF_LABELS]
    prod = score_factors(factors, drop=tuple(wf))
    prod_sel = prod['longScore'] if prod['direction'] == 'long' else prod['shortScore']
    prod_ok = (abs(prod_sel - conf) < 1e-9 and prod['direction'] == dirc)

    rec = {'id': rid, 'symbol': sym, 'coin_id': coin_id,
           'created_at': created_at,
           'prod_direction_recorded': dirc, 'prod_confidence_recorded': conf,
           'prod_reproduced': prod_ok}

    if not prod_ok:
        rec.update({'challengerDisposition': 'unscored',
                    'notes': 'production score does not reproduce from ledger; challenger not computed'})
        out_rows.append(rec); continue

    c2 = score_factors(factors, drop=tuple(wf) + tuple(
        f['label'] for f in factors if is_momentum(f)))
    flipped = c2['direction'] != prod['direction']
    rec.update({
        'prod_longScore': prod['longScore'], 'prod_direction': prod['direction'],
        'c2_longScore': c2['longScore'], 'c2_shortScore': c2['shortScore'],
        'c2_weightedNet': round(c2['weightedNet'], 4),
        'c2_totalWeight': round(c2['totalWeight'], 4),
        'c2_direction': c2['direction'], 'direction_flipped': flipped,
    })

    # mirror levels
    if entry is not None and atr14:
        rpu = 1.25 * atr14
        c2_inval = entry - rpu if c2['direction'] == 'long' else entry + rpu
        sgn = 1 if c2['direction'] == 'long' else -1
        rec['c2_invalidation'] = round(c2_inval, 6)
        rec['c2_target1'] = round(entry + sgn * 1.5 * rpu, 6)
        rec['c2_target2'] = round(entry + sgn * 2.5 * rpu, 6)
        rec['c2_entry'] = entry
    else:
        rec['c2_invalidation'] = rec['c2_target1'] = rec['c2_target2'] = None
        rec['c2_entry'] = entry

    # born-dead mirror. If the direction did NOT flip, C-2's invalidation is
    # byte-identical to production's (same entry, same 1.25xATR14, same side),
    # and production already cleared the born-dead veto on this exact
    # direction to be issued -> mirror passes without OHLC recovery.
    # Only flipped rows need the signal-day OHLC.
    bd = 'UNRECOVERABLE'
    if not flipped and inval is not None and atr14:
        bd = 'passed (non-flipped; invalidation identical to production, veto cleared at issuance)'
    elif rec['c2_invalidation'] is not None:
        cands = [(d_, h, l) for (a, d_, h, l) in snaps if a == coin_id]
        if cands:
            d_, h, l = sorted(cands)[-1]
            inv = rec['c2_invalidation']
            if c2['direction'] == 'long':
                bd = 'SUPPRESSED(born-dead-mirror)' if l <= inv else 'passed'
            else:
                bd = 'SUPPRESSED(born-dead-mirror)' if h >= inv else 'passed'
            rec['born_dead_mirror_day'] = d_
    rec['born_dead_mirror'] = bd
    rec['short_regime_gate'] = 'UNVERIFIABLE-HISTORICAL'

    if bd.startswith('SUPPRESSED'):
        disp, note = 'abstain', 'challenger direction fails mirrored born-dead veto'
    elif bd == 'UNRECOVERABLE':
        if not flipped:
            disp, note = 'abstain', 'no persisted atr14/entry; mirrored invalidation uncomputable historically'
        else:
            disp, note = 'abstain', 'flipped direction but signal-day OHLC unrecoverable historically; gate outcome unknown'
    else:
        disp, note = ('issued', 'challenger leg would be issued (short-regime gate unverifiable historically)'
                      if not flipped else
                      ('issued', 'flipped direction; born-dead mirror passed (short-regime gate unverifiable historically)'))
    rec['challengerDisposition'] = disp
    rec['notes'] = note
    out_rows.append(rec)

cols = ['id', 'symbol', 'coin_id', 'created_at',
        'prod_direction_recorded', 'prod_confidence_recorded', 'prod_reproduced',
        'prod_longScore', 'prod_direction',
        'c2_longScore', 'c2_shortScore', 'c2_weightedNet', 'c2_totalWeight',
        'c2_direction', 'direction_flipped',
        'c2_entry', 'c2_invalidation', 'c2_target1', 'c2_target2',
        'born_dead_mirror', 'born_dead_mirror_day', 'short_regime_gate',
        'challengerDisposition', 'notes']
with open(OUT, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore')
    w.writeheader()
    for r in out_rows: w.writerow(r)

n = len(out_rows)
scored = [r for r in out_rows if r['challengerDisposition'] in ('issued', 'abstain')]
flipped = [r for r in scored if r.get('direction_flipped')]
print('rows:', n, '| production reproduced:', sum(r['prod_reproduced'] for r in out_rows))
print('challenger scored:', len(scored), '| direction flipped:', len(flipped),
      '(%.1f%%)' % (100 * len(flipped) / len(scored) if scored else 0))
from collections import Counter
print('dispositions:', dict(Counter(r['challengerDisposition'] for r in out_rows)))
print('wrote', OUT)
