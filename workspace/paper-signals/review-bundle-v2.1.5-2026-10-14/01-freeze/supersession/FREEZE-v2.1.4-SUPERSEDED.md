# freeze-manifest-v2.1.4.json — SUPERSEDED

Superseded by **freeze-manifest-v2.1.5.json** (operational-verification amendment, 2026-10-14).

v2.1.4's bytes are preserved untouched. The active manifest is now v2.1.5, which adds:
1. harness receipt-expiry parity check (received_at > window_end → abstain:entry-expired), and
2. the live-stream adapter's full-record extension (contract, entry_observation, frozen_levels, gate_inputs, waiting_interval_evidence) + collector fold_full_record.

No prediction-weight, factor-set, scoring-formula, or asserted-rule changes. Recovery implementation untouched.
