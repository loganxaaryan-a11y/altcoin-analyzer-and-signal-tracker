# Abstain-sample measurement note — 2026-10-21

**Scope:** the bounded sample of production-model abstentions (closeout item 7, doc 47). PAPER ONLY, measurement only. This note reports the collected records as they stand; it changes nothing in the pipeline and preserves every record. **Evidence label (corrected 2026-10-21, evening — Correction E, §6): the first five records are an initial retrospectively selected sample** — their decisions (2026-10-21 01:48Z–06:58Z) predate the sampler's implementation later that day, and they were selected at 18:06:12Z under the recorded rule. Selection is demonstrated outcome-blind in §6; on that demonstration, subsequent outcomes on these records may be treated as prospective evidence. Only additions selected after implementation, under the recorded selection rule, are prospective in the ordinary way.

**As of:** 2026-10-21 ~22:45Z (18:45 EDT), read from the ledger below. No collection run has added samples since the first run.

**Source of record:** `paper-signals/comparison/rows/rejected-abstain-sample.jsonl` — 5 lines, all `record_type: abstain_sample`, zero `abstain_sample_outcome` lines. Collector: `paper-signals/comparison/rejected_abstain_sample.py`. Governing text: the collector's own header + step 3d of the `paper-signal-comparison-collection` job + doc 47 item 7. (The challenger-r1-v3 registration does **not** contain the abstain-sample rules — it governs the challenger scorer only. Anyone looking for the sample's rules in the v3 registration will not find them.)

## 1. Unique assets vs total records — the headline

- **Total records: 5.**
- **Unique assets: 2** — WLD (`worldcoin-wld`) and ZRO (`layerzero`).

The sample is reported as **two unique assets and five episodes**, and the unique-asset count (2) is the headline number. The raw record count (5) overstates the breadth of what has been sampled by 2.5×. And even the count of 2 must not be read as two statistically independent observations: all five episodes occurred on the same day, inside a single market regime, so effective independence is weaker than the asset count suggests (see §4).

## 2. Repeated episodes

| Asset | Records | Sample ids (candidate ids) | Decision instants (UTC) | Discovery runs |
|---|---|---|---|---|
| WLD | 3 | abstain-sample:296 (296), :310 (310), :322 (322) | 2026-10-21T01:48:26.428Z, 04:39:59.798Z, 06:58:19.961Z | 134, 135, 136 |
| ZRO | 2 | abstain-sample:298 (298), :311 (311) | 2026-10-21T01:48:26.428Z, 04:39:59.798Z | 134, 135 |

All five are Binance Spot, direction long, baseline disposition `abstained:production_model_abstain`, production scores 50/50/50/53/50. Candidates 296/298/310/311 carry freeze stamp paper-pilot-v2.1.3 in their candidate keys; candidate 322 carries v2.1.4.

**Repeated observations of the same asset are not independent evidence of broad coverage.** WLD appearing three times is one asset the frozen model kept abstaining on across three consecutive discovery runs — a concentration fact about WLD (and about which assets reach the abstain stage), not three assets' worth of coverage. Any breadth claim for this sample must be made over the unique-asset count (2), never over the record count (5).

## 3. Sample-selection rules, as implemented

Quoted/paraphrased tightly from `rejected_abstain_sample.py` (header + code) and cron step 3d:

1. **Selection criterion, full stop:** "selection is 'the production model abstained'" — `reasonCode == "production_model_abstain"`. The sampler "is not a scorer and applies no model."
2. **Window:** "candidates with decisionAt in [2026-10-21T00:00:00Z, 2026-11-18T23:59:59Z] (four weeks from the pass)."
3. **Per-run cap:** "at most 5 NEW samples per invocation."
4. **Total cap:** "at most 50 samples, ever. Evaluation of already-sampled records continues until each resolves or hits its 30-day cap."
5. **Order:** eligible candidates are sorted by decision instant ascending and the first ones up to the cap are taken — oldest-decision-first. Sampling dedupes on candidate id (`abstain-sample:<candidate_id>`); a candidate already in the ledger is never re-sampled.
6. **Venue scope:** "Binance Spot only (the evaluator's bar source). MEXC Spot abstentions are counted and excluded — MEXC is research-only this phase." In the first run's status pull, **16 MEXC abstains were counted and excluded** by venue scope (doc 47 item 7). The ledger itself contains no MEXC records by design; the count of 16 rests on doc 47's report of that run's output, not on a ledger artifact.
7. **Levels required:** a candidate missing `decisionReferencePrice` or `stopPrice` is excluded (`missing_levels`), never repaired. A candidate whose recorded invalidation is not strictly on the correct side of the reference is sampled as `non_evaluable_geometry` — "levels are never clamped or repaired here." (All 5 current records are `evaluable: true`.)
8. **Measurement conventions on every record:** hypothetical entry at the recorded `decisionReferencePrice`; invalidation = recorded `stopPrice`; target1 derived from the frozen +1.5R settlement geometry and labeled `derived_frozen_geometry_1.5R` (production records no target for abstains — the derived target is never presented as a recorded level); evaluator `crypto-evaluation-v5-corrected`; costs 18 bps round-trip.
9. **Isolation:** "It never issues, never enrolls anything in any shadow book, and creates no position any lane can act on. Its only output is its own ledger … which no production or challenger code reads." Wired as step 3d of the collection job, run after the status pull.

Changing any bound "requires a new implementation decision, not an edit in passing" (collector header).

## 4. Current outcome state, and what the sample can and cannot show

**State as of this note:** the ledger holds 5 sample records and **no outcome records**. Doc 47 records that all 5 evaluated `open_no_event` at the first walk (no target1 touch, no invalidation touch yet). `open_no_event` is a transient per-run evaluation status printed by the sampler, not a stored ledger record — the ledger only gains a line when a sample closes. So the stored truth is: 5 open samples, 0 resolved, 0 outcomes measured so far.

**What it can show at maturity (Dec 16 review context):** for each sampled episode, what the frozen production model left on the table by abstaining — the forward outcome of the rejected candidate under the same evaluation standard as issued positions (first-touch, 30-day cap, 18 bps costs). Aggregated honestly, that is an answer across the **unique assets actually sampled** — currently 2. Outcomes on the initial five records count as prospective evidence only on the strength of the outcome-blindness demonstration in §6 (Correction E): selection is shown there to have been outcome-blind, which is what licenses treating their *subsequent* outcomes as prospective evidence despite the retrospective selection.

**What it cannot show:** with the sample concentrated in WLD (3 episodes) and ZRO (2), it cannot support a broad claim like "the model wrongly abstains across the universe." Episodes of one asset share that asset's regime, so the 5 records are closer to 2 independent reads than 5. If later collection runs diversify the asset mix, the breadth claim strengthens at the rate unique assets accrue — capped at 50 records total, ≤5 new per run, inside the window ending 2026-11-18. Until then, any Dec 16 statement from this sample must be phrased per-asset (WLD, ZRO) or explicitly as a 2-asset read — and qualitative, not pooled statistics: with 5 episodes over 2 same-day assets, no pooled win rate or average over this sample is a meaningful statistic.

## 5. Coverage-honesty note

The shadow evaluator's walk checks the Binance bars it actually fetched for each sample — a finite check over a finite window. **That check does not establish that data gaps can never occur.** A clean pass on the bars retrieved so far says nothing about bars that could be missing in a future fetch or a future window. Missing-coverage handling therefore stays active: where coverage is missing, the outcome stays UNKNOWN (per the evaluator's gap rule) rather than being read as no-event, and no sample outcome should ever be promoted from "no gap observed" to "no gap possible."

## 6. Correction E (appended 2026-10-21, evening) — evidence label: initial retrospectively selected sample, and the outcome-blindness demonstration

**The label.** The five decisions in this sample were made at 2026-10-21T01:48:26Z, 04:39:59Z, and 06:58:19Z (discovery runs 134–136) — hours *before* the sampler existed. The sampler was implemented later that day during the implementation pass and first ran at 18:06:12Z (the `sampled_at` stamp on all five records; see Discrepancy 1 below), selecting from decisions already on record. These five are therefore an **initial retrospectively selected sample**, not a prospective one. (The collector's own header calls the design a "bounded prospective sample" — that describes the window's intent going forward; relative to the implementation instant, the initial selection reached backward.) Future additions are selected at decision time under the recorded rule (§3) and are prospective in the ordinary way.

**Why subsequent outcomes can still be treated as prospective evidence — the demonstration.** Retrospective selection is only fatal if selection could have been influenced by the outcomes. It could not, on three pieces of evidence:

1. **The criterion contains no outcome.** Selection is, full stop: `reasonCode == "production_model_abstain"`, decisionAt inside the window, Binance Spot, `decisionReferencePrice`/`stopPrice` present; ordering oldest-decision-first; dedupe on candidate id (§3). No outcome, result, or price-path field is an input to any step of it.
2. **The code path reads decision fields only (inspected).** In `rejected_abstain_sample.py` (read at correction time, 2026-10-21 evening), the sampling loop tests exactly the fields above — `reasonCode`, `decisionAt`, `id`, `venue`, `decisionReferencePrice`, `stopPrice`, `direction`, plus bookkeeping fields it copies onto the record — sorts the eligible list by `decisionAt`, and takes the first ≤5 up to the caps. Outcome evaluation is a separate phase that runs afterwards over records already sampled; nothing computed there feeds back into selection.
3. **No outcomes existed to see.** At sampling time (18:06:12Z) the ledger held zero outcome records for these candidates, and it still holds zero: `rows/rejected-abstain-sample.jsonl` contains 5 lines, all `record_type: abstain_sample`, and **0** `abstain_sample_outcome` lines (count verified at this correction). Doc 47 records all five as `open_no_event` at the first walk — nothing had resolved before selection, and nothing has resolved since.

**Limit of the demonstration.** The code was inspected as it stands at correction time; its byte-identity at 18:06Z is attested by doc 47's contemporaneous description of the same criterion and run, not by a preserved hash of the file. The verdict is therefore: **outcome-blind by construction of the criterion and the selection path, corroborated by the empty outcome ledger — not an independent audit of the 18:06Z execution.**

**Consequence.** On this demonstration, outcomes that accrue on these five records *after* selection may be treated as prospective evidence. Had any part of the demonstration failed, the five would have to be reported as retrospective reads only, and no later outcome on them could be promoted. The label of the initial five does not change; future additions follow the recorded selection rule.

**Reporting form.** This sample is **two unique assets and five episodes**. Two assets are not automatically two statistically independent observations — the episodes share a day and a market regime — so Dec 16 claims from this sample are per-asset and qualitative, never pooled statistics.

## Discrepancies found (record truth vs the brief for this note)

1. **Sampling timestamp.** The brief (following the summary line) described the first run as "2026-10-21T17:40Z." The records themselves say `sampled_at: 2026-10-21T18:06:12Z` for all five. Doc 47 reconciles the two: the sampler ran against the **17:40Z status pull** but executed at 18:06:12Z during the implementation pass. Corroborating: the 17:40Z collection run's own log section reports no step-3d summary — the cron wiring (step 3d) was added after that run (~18:05–18:08Z). So: first samples = implementation-pass run at 18:06:12Z over the 1740Z pull, not the 17:40Z cron run itself. The records govern.
2. **MEXC count provenance.** The "16 MEXC abstains counted + excluded" figure is attested in doc 47 item 7 as the first run's exclusion count; it is not independently recoverable from the ledger (MEXC records are excluded before writing, by design). Reported here as doc-47-attested, not ledger-verified.
3. **Outcome state storage.** "All open_no_event" is true as an evaluation result (doc 47) but is not a stored state — the ledger contains zero outcome lines. A reader of the ledger alone sees 5 open samples and no evaluation status.
