# Paper-signal alert schema — 2026-10-14

Logan's refined alert routing spec (2026-10-14). **PAPER ONLY** — no brokerage,
no orders, no real money. Every alert is labeled PAPER.

## Alert types

Two alert types. They are NEVER conflated:

| Type | Meaning | Issued when |
|---|---|---|
| `SETUP_PENDING` | A paper signal qualified and is awaiting entry | The issuance contract is committed (candidate qualified, pending contract row written) and the entry-observation watcher is armed |
| `ENTRY_CONFIRMED` | The paper entry was actually observed on a venue print | Entry is observed on a real post-decision print inside the entry window and the waiting-interval veto passes |

Rules:
- A `SETUP_PENDING` alert MUST NOT contain any entry-observed fields.
- An `ENTRY_CONFIRMED` alert MUST NOT be issued unless entry was observed on a
  real venue print; it is never a projection or a "likely entry".
- At most one `SETUP_PENDING` and at most one `ENTRY_CONFIRMED` per signal.
- Abstentions are NOT alerts: routine abstentions stay in the terminal only
  (see DELIVERY-SEMANTICS-2026-10-14.md); the chat gets a compact daily summary.

## Dedup key

`(signal_id, alert_type)`. Send once per event; retries are idempotent on this key.

## Common required fields (every alert)

| Field | Type | Rule |
|---|---|---|
| `schema_version` | string | `"2026-10-14"` |
| `paper` | boolean | `true`, always |
| `label` | string | `"PAPER"` — must appear in any human rendering of the alert |
| `alert_type` | string | `"SETUP_PENDING"` or `"ENTRY_CONFIRMED"` |
| `signal_id` | string | the signal's canonical id (e.g. `sig_53bb…`) |
| `asset` | string | e.g. `"BTCUSD"` |
| `direction` | string | `"long"` or `"short"` |
| `setup_reason` | string | terse: which qualification gates passed and why |
| `entry_rule` | string | the rule defining entry (e.g. "first post-decision spot print inside the 15-min window, drift ≤ 1.5%") |
| `entry_price` | number | pending: the contract entry level; confirmed: the observed entry print |
| `invalidation` | object | `{ price, rule }` — the level and the condition that kills the paper setup |
| `targets` | object | `{ t1, t2 }` — paper target levels |
| `horizon` | string | observation/holding window for the paper position |
| `data_timestamp` | string (ISO) | venue timestamp of the market data behind the alert — never the alert-generation wall clock |
| `issued_at` | string (ISO) | wall-clock time the alert was issued |
| `destinations` | array | `["research-side-chat", "terminal-tracker"]` |
| `test` | boolean | `true` ONLY for the one routing-test notification; `false` otherwise |

## SETUP_PENDING additional fields

| Field | Type | Rule |
|---|---|---|
| `status` | string | `"pending"` |
| `observation_window` | string | e.g. `"15 min (crypto) / 40 polls × 20 s"` |
| `qualification_evidence` | string | pointer to the persisted contract/candidate rows |

Must NOT contain: `entry_observed_at`, `venue_print_ts`, `waiting_interval_veto`.

## ENTRY_CONFIRMED additional fields

| Field | Type | Rule |
|---|---|---|
| `status` | string | `"confirmed"` |
| `entry_observed_at` | string (ISO) | when the entry print was observed |
| `venue_print_ts` | string (ISO) | the venue's own timestamp on the entry print |
| `waiting_interval_veto` | string | `"pass"` (an entry alert exists only if the veto passed) |
| `post_entry_check` | string | result of the post-entry evidence check |

Must NOT be labeled `pending` anywhere in the payload or rendering.

## Human rendering (chat)

Every chat rendering opens with the label and type, e.g.:

> **PAPER — ENTRY CONFIRMED** (paper signal, no real order)
> BTCUSD long · sig_53bb2a86d2e0fee1f3664812
> ...

and for pending setups:

> **PAPER — SETUP PENDING** (qualified, awaiting entry — not a position)

The two renderings are visually distinct; a pending setup must never read as a filled entry.
