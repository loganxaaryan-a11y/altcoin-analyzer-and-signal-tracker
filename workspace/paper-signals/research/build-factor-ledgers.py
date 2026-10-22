#!/usr/bin/env python3
"""Build per-candidate factor ledgers from COMPLETE-SCAN-2026-10-13.json.

Read-only. Writes factor-ledgers-2026-10-13.json into this directory.

For each candidate:
  - equity: the persisted 7-factor ledger (qualified rows) with the frozen
    agreement score recomputed: rawScore = round(100*SUM(w*s)/SUM(w)),
    redundancyAdjustment = -5/+5 toward zero when the five trend-cluster
    factors are unanimous, finalScore = raw + adjustment.
  - crypto: the persisted 7-dimension discovery ledger (retained rows) with
    alignment recomputed as SUM(contributions) - trendMomentumRedundancy,
    floored at 0.
  - rankScore (equity) recomputed: (high->200|medium->100|low->0)
    + 22*supports - 28*conflicts + 0.5*|fiveDimAgreement| + min(15, 5*|volumeZ|).
Rows without persisted ledgers are listed under `unavailable` with their
recorded metadata and the exact reason.
"""
import json, re, datetime

SRC = '/home/hatch/workspace/goals/research-terminal/hidden_files/source-export-2026-10-13/COMPLETE-SCAN-2026-10-13.json'
OUT = '/home/hatch/workspace/goals/research-terminal/paper-signals/research/factor-ledgers-2026-10-13.json'

CLUSTER = ['Price vs SMA 20', 'Price vs SMA 50', 'Price vs SMA 200',
           'MACD 12–26', 'ATR-adjusted 30-session trend']

d = json.load(open(SRC))

def equity_recompute(c):
    fv = c['factorValues']
    issues = []
    for f in fv:
        if f['contribution'] != f['weight'] * f['score']:
            issues.append({'factor': f['name'], 'weight': f['weight'],
                           'score': f['score'], 'contribution': f['contribution'],
                           'issue': 'contribution != weight*score'})
    num = sum(f['weight'] * f['score'] for f in fv)
    den = sum(f['weight'] for f in fv)
    raw = round(100 * num / den) if den else None
    cl = [f['score'] for f in fv if f['name'] in CLUSTER]
    adj = 0
    if len(cl) == 5 and all(s == 1 for s in cl): adj = -5
    elif len(cl) == 5 and all(s == -1 for s in cl): adj = 5
    final = raw + adj if raw is not None else None
    direction = 'long' if final is not None and final >= 20 else \
                ('short' if final is not None and final <= -20 else 'mixed')
    # rankScore recompute
    tier = c['confidenceTier']
    base = {'high': 200, 'medium': 100, 'low': 0}[tier]
    supports = sum(1 for x in (c['dimensions'] or []) if x['status'] == 'supports')
    conflicts = sum(1 for x in (c['dimensions'] or []) if x['status'] in ('conflicts', 'opposes'))
    m = re.search(r'([+-]?\d+) five-dimension agreement', c['why'] or '')
    five_dim = int(m.group(1)) if m else 0
    vz = c['volumeZ'] or 0.0
    rank_rec = base + supports * 22 - conflicts * 28 + abs(five_dim) * 0.5 + min(15, abs(vz) * 5)
    return {
        'sumWeightTimesScore': num, 'sumWeights': den, 'rawScore': raw,
        'redundancyAdjustment': adj, 'finalScore': final,
        'directionFromScore': direction,
        'rankScoreRecomputed': round(rank_rec, 2),
        'supports': supports, 'conflicts': conflicts,
        'fiveDimensionAgreement': five_dim,
        'ledgerArithmeticIssues': issues,
    }

def crypto_recompute(c):
    fv = c['factorValues'] or []
    issues = []
    total = 0
    for f in fv:
        total += f['contribution'] or 0
    # trendMomentumRedundancy: -10 when Trend and Momentum both pass long/short
    # (actions.ts:1083). Recoverable from the ledger statuses.
    status = {f['name']: f['status'] for f in fv}
    redundancy = 0
    if status.get('Trend') == 'pass' and status.get('Momentum') == 'pass':
        redundancy = -10
    aligned = max(0, total + redundancy)
    recorded = c.get('alignment')
    if recorded is not None and aligned != recorded:
        issues.append({'issue': 'recomputed alignment != recorded alignment',
                       'recomputed': aligned, 'recorded': recorded,
                       'note': 'redundancy rule may differ; ledger sum of contributions = %d' % total})
    return {'sumContributions': total, 'trendMomentumRedundancy': redundancy,
            'alignmentRecomputed': aligned, 'alignmentRecorded': recorded,
            'ledgerArithmeticIssues': issues}

out = {
  'exportedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'source': 'COMPLETE-SCAN-2026-10-13.json (read-only; no production changes)',
  'provenance': d['provenance'],
  'formulas': {
    'equityFactorAgreement': {
      'rawScore': 'round(100 * SUM(weight*score) / SUM(weight)), scores in {-1,0,+1}',
      'redundancyAdjustment': '-5 toward zero if all five trend-cluster factors are +1; +5 if all are -1; else 0',
      'finalScore': 'rawScore + redundancyAdjustment',
      'direction': 'score >= 20 -> long; <= -20 -> short; else mixed',
      'codeRefs': ['actions.ts:143-157 (factorScoreBreakdown)', 'm:270 (mirror)'],
    },
    'equityRankScore': {
      'formula': '(high->200 | medium->100 | low->0) + 22*supports - 28*conflicts + 0.5*|fiveDimensionAgreement| + min(15, 5*|volumeZ|)',
      'codeRef': 'actions.ts:2150',
    },
    'cryptoDiscoveryAlignment': {
      'alignment': 'SUM(dimension contributions) - trendMomentumRedundancy, floored at 0; redundancy = -10 when Trend and Momentum both pass',
      'codeRefs': ['actions.ts:1028-1086 (fiveDimensionGate)', 'actions.ts:1083 (trendMomentumRedundancy)'],
      'note': 'This is the DISCOVERY-gate alignment (0-100, confidence in the chosen direction with direction stored separately). It is NOT the dossier signed long score (5..95).',
    },
  },
  'equity': {'scan': {k: d['equity']['scan'][k] for k in ('runId','universe','startedAt','status','requested','scoredCount','signalCount','issuedCount','suppressedCount','watchedCount')},
             'ledgers': [], 'unavailable': []},
  'crypto': {'scan': {k: d['crypto']['scan'][k] for k in ('runId','startedAt','completedAt','status','universeSize','shortlisted','signalCount')},
             'ledgers': [], 'unavailable': []},
  'watch': {
    'note': 'No scan-watch disposition exists in either terminal. watchedCount=50 on the equity run counts the 50 persisted radar rows, not a separate candidate class. Both terminals have user watchlist tables (equity: AAPL/META/NVDA/TSLA/EMR; crypto: SUI/MON/PUMP/FARTCOIN) carrying only id/symbol/name/created_at - no scores, reasons, or scan linkage. A watch-candidate ledger cannot be reconstructed from persisted state.',
  },
}

for c in d['equity']['candidates']:
    if c['disposition'] == 'qualified' and c.get('factorValues'):
        rec = equity_recompute(c)
        out['equity']['ledgers'].append({
            'symbol': c['symbol'], 'name': c['name'], 'disposition': c['disposition'],
            'outcomeCode': c['outcomeCode'], 'rankPosition': c['rankPosition'],
            'factors': [{'name': f['name'], 'weight': f['weight'], 'score': f['score'],
                         'contribution': f['contribution'], 'reading': f['reading'],
                         'quality': f['quality'], 'asOf': f['asOf'], 'source': f['source']}
                        for f in c['factorValues']],
            'dimensions': [{'name': x['name'], 'status': x['status'], 'detail': x['detail']}
                           for x in (c['dimensions'] or [])],
            'missingInputs': c['missingInputs'],
            'timestamps': c['timestamps'],
            'recomputed': rec,
            'recorded': {'fiveDimensionAgreementScore': c['agreementScore'],
                         'direction': c['direction'], 'confidenceTier': c['confidenceTier'],
                         'rankScore': c['rankScore'],
                         'invalidationLevel': c['invalidationLevel']},
            'consistency': {
                'ledgerInternallyConsistent': len(rec['ledgerArithmeticIssues']) == 0,
                'directionMatchesRecomputedScore': rec['directionFromScore'] == c['direction'],
                'rankScoreReproduces': abs(rec['rankScoreRecomputed'] - c['rankScore']) < 0.011,
                'note': 'recorded agreementScore is the five-dimension rating score, NOT the 7-factor agreement score; both verified on all 50 rows',
            },
        })
    else:
        why = 'rank_cap: per-factor ledger computed in-memory and discarded; only the diagnostics row (stage/scoring, outcome/scored, reason_code/rank_cap) persists' \
            if c['outcomeCode'] == 'scored' else \
            'issuance-gate suppression: row deleted from market_scan_signals on suppression; only agreementScore (-20/-24) + veto reason persist'
        out['equity']['unavailable'].append({
            'symbol': c['symbol'], 'disposition': c['disposition'],
            'outcomeCode': c['outcomeCode'], 'reasonCode': c['reasonCode'],
            'recorded': {'agreementScore': c.get('agreementScore'),
                         'direction': c.get('direction'),
                         'rankScore': c.get('rankScore'),
                         'reason': c.get('reason')},
            'whyUnavailable': why,
        })

for c in d['crypto']['candidates']:
    if c.get('factorValues'):
        rec = crypto_recompute(c)
        out['crypto']['ledgers'].append({
            'symbol': c['symbol'], 'coinId': c['coinId'], 'disposition': c['disposition'],
            'rankPosition': c['rankPosition'],
            'dimensions': [{'name': f['name'], 'status': f['status'], 'weight': f['weight'],
                            'contribution': f['contribution'], 'reading': f['reading'],
                            'evidence': f['evidence']} for f in c['factorValues']],
            'missingInputs': c['missingInputs'],
            'timestamps': c['timestamps'],
            'triggerReasons': c['triggerReasons'],
            'recomputed': rec,
            'recorded': {'alignment': c['alignment'], 'direction': c['direction'],
                         'confidenceTier': c['confidenceTier'],
                         'passedDimensions': c['passedDimensions'],
                         'discoveryTier': c['discoveryTier'],
                         'invalidationLevel': c['invalidationLevel']},
            'consistency': {
                'ledgerInternallyConsistent': len(rec['ledgerArithmeticIssues']) == 0,
                'note': 'discovery-dimension ledger only; the 11-factor dossier agreement ledger is NOT part of the scan export (it lives on generated_signals for issued rows)',
            },
        })
    else:
        out['crypto']['unavailable'].append({
            'symbol': c['symbol'], 'coinId': c.get('coinId'), 'disposition': c['disposition'],
            'scanStage': c.get('scanStage'),
            'recorded': {'alignment': c.get('alignment'),
                         'change48hPct': c.get('change48hPct'),
                         'veto': c.get('veto'),
                         'reason': c.get('reason'),
                         'discoveryTier': c.get('discoveryTier'),
                         'triggerReasons': c.get('triggerReasons'),
                         'shortRegimeGate': c.get('shortRegimeGate'),
                         'issuancePath': c.get('issuancePath'),
                         'suppressionRow': c.get('suppressionRow'),
                         'reasons': c.get('reasons')},
            'whyUnavailable': 'logSuppressedSignal path persists metadata only (alignment, change48h, discoveryTier, triggerReasons, shortRegimeGate) - never the dimension ledger. The excluded (AMP) and failed (HOODINU) candidates never reached scoring.',
        })

json.dump(out, open(OUT, 'w'), indent=1, default=str)
print('wrote', OUT)
print('equity ledgers:', len(out['equity']['ledgers']), '| unavailable:', len(out['equity']['unavailable']))
print('crypto ledgers:', len(out['crypto']['ledgers']), '| unavailable:', len(out['crypto']['unavailable']))
eq_bad = sum(1 for l in out['equity']['ledgers'] if not l['consistency']['ledgerInternallyConsistent'] or not l['consistency']['directionMatchesRecomputedScore'] or not l['consistency']['rankScoreReproduces'])
print('equity ledger consistency failures:', eq_bad)
cr_bad = sum(1 for l in out['crypto']['ledgers'] if not l['consistency']['ledgerInternallyConsistent'])
print('crypto ledger consistency failures:', cr_bad)
