# Queued research: DXRG "What LLM Trading Agents Actually Do in Production"

**Status:** QUEUED — starts only after automatic discovery-to-paper issuance works.
**Source:** DX Research Group, Sep 2026 — https://arxiv.org/abs/2609.05663
**Artifacts:** https://github.com/ProjectDXAI/continuous-record-llm-trading-agents

## Why this paper (expert's direction)

Four findings relevant to our terminal:
1. The operating layer (sliders, rendered candidate lists, order-path mechanics) determines behavior more than strategy text.
2. Sizing is volatility-blind (median 5x leverage in every volatility sextile).
3. Agents capture almost none of favorable excursion (43.2% saw +300bps within 24h; 49.3% of those closed negative; a mechanical bracket recovers +39bps/position).
4. Neither fleet shows a directional edge (41% vs 50% benchmark win rate).

## Experiment designs to build (separate experiments, not one bundle)

1. **Candidate-ranking effects** — does ranking position causally change selection/outcomes (cf. the paper's leaderboard render-boundary discontinuity)? Test: regression discontinuity around our rank cutoffs.
2. **Deterministic exit policies** — fixed 2%/4% exits as a CHALLENGER HYPOTHESIS, not a production prescription. Compare against our ATR-based exits on identical decision-time inputs.
3. **Tool ablations** — remove data tools/factors one at a time (extends the one-at-a-time removal work); measure what each tool contributes.
4. **Model-cost comparisons** — invocation cost vs decision quality across model choices; the paper found no cross-model separation, test whether that holds for us.

## Constraints (expert's, binding)

- Identical decision-time inputs across all arms; realistic costs (18 bps + invocation costs where applicable).
- Report four dimensions SEPARATELY: prediction quality, exit quality, operational reliability, costs. Never blend into one score.
- Do NOT change the frozen v2.1.x trial. Do NOT add leverage execution from this thread.
- Paper signals only.
