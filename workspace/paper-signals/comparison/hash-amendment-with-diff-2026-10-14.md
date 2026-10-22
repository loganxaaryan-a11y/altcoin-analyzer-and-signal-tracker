# Hash amendment — `live-paper-stream-decisionAt-fix.diff` (included verbatim)

**Source file (canonical):**
`paper-signals/closeout-2026-10-14/08-hash-drift-amendment/live-paper-stream-decisionAt-fix.diff`
(5 hunks, 109 lines). The full text below is a byte-exact copy of that file;
the canonical file is untouched. Companion record:
`paper-signals/closeout-2026-10-14/08-hash-drift-amendment/HASH-DRIFT-AMENDMENT-2026-10-14.md`.

## What it changes and why the pre-fix baseline was verified byte-for-byte

The diff repairs the collection adapter `comparison/live_paper_stream.py` in
two places: (1) it adds a `_factor_ledger()` helper plus its two call sites,
mapping the deployed `getpaperpilotstatus` schema's `factorLedgerJson`
(camelCase JSON string) to harness factor dicts verbatim (name→label, no
remapping — the frozen harness judges completeness against its own factor
sets, never guesses); and (2) it fixes timestamp extraction in
`candidate_from_paper_signal` and `candidate_from_paper_candidate` to read
`decisionAt` (camelCase) via the script's own `_pick` helper, because the
deployed schema persists decision time as `decisionAt` and the snake_case-only
read silently dropped every deployed record as "pre-freeze" (a false healthy
0-row run; after the fix, 8 candidates exported, 0 excluded pre-freeze). No
model, weight, threshold, or formula was changed — operational plumbing only.
The pre-fix baseline was verified byte-for-byte because the diff's "before"
side is not a reconstruction: it is the manifest-recorded v2.1.5 version,
sha256 `0f6393006d935c82d4b3d841aa23faec8adb18e860e006b16d4ab07a42b04836`,
sourced from `review-bundle-v2.1.5-2026-10-14/02-sources/live_paper_stream.py`,
diffed against the current file
(sha256 `f421b72873f7ff8a0042f91d1185a9a6da0c451541ae276fbf4eec4ed385f4b2`);
`tests/test_version_mapping.py` reports the manifest mismatch honestly, and
the frozen manifest itself is left byte-identical (the drift is recorded as
an amendment, not hidden by rewriting the freeze record).

---

```diff
--- a/live_paper_stream.py (manifest-recorded v2.1.5, sha256 0f6393006d935c82d4b3d841aa23faec8adb18e860e006b16d4ab07a42b04836)
+++ b/live_paper_stream.py (current, sha256 f421b72873f7ff8a0042f91d1185a9a6da0c451541ae276fbf4eec4ed385f4b2)
@@ -150,6 +150,54 @@
     return _pick(rec, "inputs") or {}
 
 
+def _factor_ledger(rec):
+    """The decision-time factor ledger as harness-schema factor dicts.
+
+    The deployed paper pilot persists the decision-time ledger as
+    `factorLedgerJson` (a JSON string; the status serializer keeps the
+    handler's camelCase persisted name). Legacy serializers may carry it
+    parsed under `factor_ledger`/`factors`. Each entry carries the
+    deployed fields (name, contribution, weight, evidence, reading,
+    status); it is translated to the harness factor schema with `label`
+    = the deployed name VERBATIM -- no renaming, no invented mapping to
+    the frozen model's labels. The frozen harness judges completeness
+    against its own factor sets (RULE 3); a ledger from a different
+    model is present-but-incomplete, never guessed from.
+
+    Per-factor decision-time stamps are NOT persisted by the deployed
+    path, so entries carry no asOf: the frozen decision_time_check will
+    label such rows accordingly (unlabeled inputs are never assumed).
+    Absent or unparseable -> None (never fabricated).
+    """
+    raw = _pick(rec, "factorLedgerJson", "factor_ledger_json",
+                "factorLedger", "factor_ledger")
+    ledger = None
+    if isinstance(raw, str) and raw.strip():
+        try:
+            ledger = json.loads(raw)
+        except Exception:
+            ledger = None
+    elif isinstance(raw, (list, tuple)):
+        ledger = list(raw)
+    if not isinstance(ledger, list) or not ledger:
+        return None
+    factors = []
+    for entry in ledger:
+        if not isinstance(entry, dict):
+            continue
+        name = entry.get("name") or entry.get("label")
+        factors.append({
+            "label": name,  # verbatim deployed factor name; no remapping
+            "name": name,
+            "contribution": entry.get("contribution"),
+            "weight": entry.get("weight"),
+            "evidence": entry.get("evidence"),
+            "reading": entry.get("reading"),
+            "status": entry.get("status"),
+        })
+    return factors or None
+
+
 # ---------------------------------------------------------------------------
 # Full-record block builders
 # ---------------------------------------------------------------------------
@@ -544,7 +592,11 @@
 def candidate_from_paper_signal(sig, status_data, alert_index=None):
     """Map one deployed paper_signals row to a collector candidate dict."""
     sig_id = sig.get("id") or sig.get("signal_id")
-    decision_at = sig.get("decision_at") or sig.get("decided_at")
+    # 2026-10-14 fix: the deployed getpaperpilotstatus schema persists
+    # decisionAt (camelCase); snake_case alone dropped every deployed record
+    # as "pre-freeze". _pick keeps the documented camelCase+snake_case
+    # tolerance; absent -> None, never fabricated.
+    decision_at = _pick(sig, "decisionAt", "decision_at", "decided_at")
     blocks = _full_record_blocks(sig, issued=True)
     # The deployed handler's deterministic contract id is ct_<candidateId>.
     deployed_cid = sig.get("candidateId") or sig.get("candidate_id")
@@ -564,7 +616,13 @@
         "decision_at": decision_at,
         "issued_at": sig.get("issued_at"),
         "row_origin": "pilot",
-        "factors": sig.get("factors") or sig.get("factor_ledger"),
+        # 2026-10-14 factor-ledger mapping: the deployed schema persists the
+        # decision-time ledger as factorLedgerJson (camelCase JSON string).
+        # Mapped verbatim (name -> label, no remapping); the frozen harness
+        # judges completeness against its own factor sets (RULE 3). Absent
+        # in the deployed record -> None, never fabricated.
+        "factors": (_factor_ledger(sig) or sig.get("factors")
+                    or sig.get("factor_ledger")),
         "factors_asof": sig.get("factors_asof"),
         "production_recorded": {
             "direction": sig.get("direction"),
@@ -604,7 +662,9 @@
 def candidate_from_paper_candidate(cand, status_data, alert_index=None):
     """Map one deployed paper candidate (incl. suppressed) to a candidate dict."""
     cid = cand.get("id") or cand.get("candidate_id")
-    decision_at = cand.get("decision_at") or cand.get("decided_at")
+    # 2026-10-14 fix: same decisionAt camelCase tolerance as the signal path
+    # above; snake_case alone mislabeled post-freeze candidates "pre-freeze".
+    decision_at = _pick(cand, "decisionAt", "decision_at", "decided_at")
     outcome = cand.get("outcome") or cand.get("status") or ""
     suppressed = "suppress" in str(outcome).lower() or cand.get("suppressed")
     issued = not suppressed and str(outcome).lower() in ("issued",)
@@ -617,7 +677,11 @@
         "decision_at": decision_at,
         "issued_at": None,
         "row_origin": "pilot",
-        "factors": cand.get("factors") or cand.get("factor_ledger"),
+        # 2026-10-14 factor-ledger mapping: same as the signal path above --
+        # factorLedgerJson (camelCase JSON string) mapped verbatim; the
+        # frozen harness judges completeness (RULE 3); absent -> None.
+        "factors": (_factor_ledger(cand) or cand.get("factors")
+                    or cand.get("factor_ledger")),
         "factors_asof": cand.get("factors_asof"),
         "production_recorded": {
             "direction": cand.get("direction"),
```
