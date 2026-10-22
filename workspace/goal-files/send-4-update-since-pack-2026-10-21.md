# Update since the send pack — 2026-10-21 (evening, EDT)

Everything below happened after send files 1–3. PAPER ONLY throughout. Full detail for item 1 is in `implementation-result-2026-10-21-expert-reply.md` (delivered to Logan 2026-10-21).

## 1. The 9-item pass — results
Delivered in full in the implementation-result file. Headlines: drift capture wired but live capture NOT demonstrated in production (gap, see item 4); ATH gate records live (run 141 read-back: 500 records, gate fired 256); a real defect in challenger v2 (no R4 bypass read path) repaired in v3; clustering structurally unusable as registered and corrected outcome-blind in v3 (v2 closed inconclusive-by-supersession); abstain sample running (bound: 2026-10-21 → 2026-11-18, cap 50); radar handoff lane retired; interval-coverage blocker retired; run-109 lease defect traced and repaired (TTL 5 min + durable coalesce work-check). Challenger v3 frozen 2026-10-21T19:12:02Z; first v3 collection run tonight 23:40Z on run-142 candidates.

## 2. Equity restart — LIVE, first setups created
`equity-paper-fill-v2` shipped (evaluator 3.4.0): F1 session-open strictly after issuance; F2 uniform gap-through exits at the bar's open both sides (fill-bar mechanical win removed); F3 net R stored beside gross R. Restart armed with the atomic reservation cap (filled + pending ≤ 5).
First pass (manual fire, 2026-10-21 17:24 EDT): **5 pending_entry setups created — GE, NFLX, LMT, BRK-B, LLY** (signal session 2026-10-21); ISRG declined on validation; 43 candidates skipped for capacity. The pass's client-side calls timed out at the 120s ceiling and the run's own brief claimed nothing; server-side read-back (`getPaperIssuance`) proves execution succeeded — execution vs receipt kept separate. The retry pass re-ran idempotently: 0 created, 5 skipped as duplicates — **dedupe + atomic cap verified live under an accidental double-run**. Cohort: {cap 5, filled 0, pending 5, expiredUnfilled 0}, halted false. Fills await the first eligible completed session bar (XNYS open strictly after issuance). The daily postmortem job was re-enabled with reporting scoped to current populations only (legacy 50 rows appear only as a labeled historical bucket).

## 3. New finding — digest announced candidates from an uncompleted run
The 21:15Z terminal digest announced 22 discovery-run-142 candidates as NEW OPPORTUNITIES (chatSentAt 21:18Z) before run 142 completed — it never did (stranded, heartbeat stale, later declared dead and recovered via P3: recovery run 143 → handoff 59). Issuance validation followed ~42 min later (run 114): 4 qualified to SETUP_PENDING (ZEC/NEAR/COMP/CVX, full-payload alert rows), 18 blocked. The candidates were real; the ordering was wrong — the digest reads the discovery store with no gate on source-run completion. Proposed fix (not applied): announce new candidates only after the source run completes, or label them pending validation. **Decision pending.**

## 4. Open decision — production drift-capture timeouts
Capture is wired (migration 0067) and clears the receipt bar end-to-end in sandbox probes. In production (run 141) all 8 Binance-mapped candidates came back unavailable/timeout. The bar was not lowered and nothing was relabeled — existing prints fail the receipt bar per record and stay labeled reconstruction. Diagnosis-first bounded repair of the production execution context (route/timeout sizing) is the one remaining decision from the pass.

## 5. Scheduled tonight
Discovery-mining first run 23:15Z (grade-C findings only, never touches issuance). First v3 collection run 23:40Z.
