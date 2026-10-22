---
id: x-sweep-digest-forward
title: X sweep digest auto-forward
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-20T08:23:48
  every: 6h
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","provider":"main","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
X-sweep digest forwarder (Logan-automated, 2026-10-15; delivery-verification repair 2026-10-20). Whenever the "Terminal research sector" side chat receives a new X Sweep digest, forward it to the Research terminal chat automatically — no manual forwarding.

WHY THIS JOB HAS VERIFICATION STEPS: on 2026-10-20 this job twice reported a digest "forwarded verbatim" and advanced the watermark, but the digest never appeared in the receiving chat — the run's final message was a status summary instead of the digest text, and both digests had to be recovered and delivered by hand. The mechanics below make that failure impossible: the confirmed watermark only advances after the digest is SEEN in the receiving chat, and a run's final message is never a status summary.

Paths:
- Confirmed watermark: ~/workspace/goals/research-terminal/hidden_files/x-sweep-digest-forward/watermark.json (fields include last_seen_digest_seq, last_seen_digest_message_id, last_seen_digest_id, last_seen_digest_title, last_seen_at).
- Pending record: ~/workspace/goals/research-terminal/hidden_files/x-sweep-digest-forward/watermark-pending.json
- Run log (bookkeeping only, never user-facing): ~/workspace/goals/research-terminal/hidden_files/x-sweep-digest-forward/run-log.md
- Source chat (READ-ONLY): 7b75e732-f527-4d53-b40d-4aa036201d9b (Terminal research sector)
- Receiving chat (this job's delivery target): a685c3e7-c8be-4137-8900-4e899008bca7 (Research terminal building)

STARTING STATE (set by the 2026-10-20 repair — do not undo): the confirmed watermark already sits at seq 76765 (message assistant-msg-aa5487e3-9e70-9b40-6769-1cc5ab462487, "X sweep 10:31 ET digest — the big one"). That digest WAS delivered to the receiving chat manually by the main agent on 2026-10-20 ~14:30 EDT and its presence there is verified. No pending record exists for it and none should be created. The first run under these mechanics starts clean from seq 76765.

Steps — IN ORDER, every run:

PHASE 0 — VERIFY ANY PENDING FORWARD, BEFORE ANYTHING ELSE.
1. If watermark-pending.json exists, read it. It lists one or more forwarded-but-unconfirmed digests, each with: message id, turn id, seq, title/first line, and a distinctive mid-digest verification string copied from that digest's body.
2. Read recent messages from the RECEIVING chat a685c3e7-c8be-4137-8900-4e899008bca7 via chat.read_messages, with enough history to cover the time since the pending forward.
3. A pending digest is CONFIRMED only if a message in the receiving chat matches its title/first line AND contains its mid-digest verification string.
   - All pending digests confirmed → promote: write the newest pending digest's id, message id, seq and title into watermark.json (same field shape as before, last_seen_at = now, written atomically), delete watermark-pending.json, note the promotion in the run log, and continue to Phase 1.
   - Any pending digest NOT found → that forward failed. Re-fetch that digest's full text from the source chat and make this run's final message that digest VERBATIM (if several are missing: all of them, chronological order, separated by a horizontal rule). Keep watermark-pending.json exactly as-is, do NOT advance the confirmed watermark, do NOT look for or process newer digests this run. End the run.

PHASE 1 — FIND NEW DIGESTS.
4. Read the confirmed watermark (last_seen_digest_seq / last_seen_digest_message_id). If watermark.json is absent entirely, treat as empty (first-ever run forwards nothing already seen — only digests newer than now).
5. Read recent messages from the source chat 7b75e732-f527-4d53-b40d-4aa036201d9b via chat.read_messages, limit 10. Digests are assistant messages from the x-smart-sweep runs: the title starts with "# X Sweep —" or reads "X sweep <time> ET digest" (both patterns occur). A digest is new when its seq is greater than last_seen_digest_seq and its message id differs from the watermarked one, and it is not already listed in watermark-pending.json.

PHASE 2 — FORWARD, THEN RECORD PENDING. NEVER ADVANCE THE CONFIRMED WATERMARK IN THIS PHASE.
6. If there are new digests: BEFORE emitting anything, write watermark-pending.json (atomically, tmp + rename) listing each new digest: message id, turn id, seq, title/first line, a distinctive mid-digest verification string (one full line copied from the middle of the digest body — not the title, not a generic phrase), and the forward time. Then make your final message the digest(s) VERBATIM: the entire digest text, no commentary before or after, no summarization; multiple digests in chronological order, separated by a horizontal rule. The confirmed watermark.json stays untouched — the NEXT run's Phase 0 confirms delivery and promotes it.
7. If there are no new digests: stay silent — output nothing user-facing (a brief internal note in the run log is fine).

FINAL MESSAGE — HARD RULE (the 2026-10-20 defect, named so it never recurs):
Your run's final message is EXACTLY one of:
(a) the verbatim digest text you are forwarding or re-emitting — nothing else, no preamble, no closing note; or
(b) completely empty, when there is nothing new and no pending digest is missing.
A status summary, confirmation note, or "forwarded successfully" line as the final message is FORBIDDEN — that is precisely how two digests were silently dropped on 2026-10-20 while the old body reported success. All status reporting goes to the run log file, which the user never sees as a chat message.

Other hard rules:
- Verbatim only. Never paraphrase, truncate, or "improve" a digest.
- Never forward the same digest twice (the pending + confirmed watermark pair is the dedup).
- Read-only on the source chat. Never post into 7b75e732.
- This job only forwards; it does not analyze, grade, or merge — the receiving agent handles that.
- Never edit MEMORY.md; run observations go to the run log above.
