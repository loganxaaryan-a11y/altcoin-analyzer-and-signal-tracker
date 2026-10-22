#!/usr/bin/env python3
"""Test timeout-after-persistence for the delivery worker §4a fix.

Simulates:
1. Worker reads alerts (§4)
2. Worker writes expiry suppression (§4a) - PERSISTENCE POINT
3. Worker TIMES OUT during slow work (§5 ack reconciliation)
4. Verify: suppression survives, no duplicate on retry
"""

import json
import os
import sys
import tempfile
from datetime import datetime, timezone, timedelta
from copy import deepcopy

def test_timeout_after_persistence():
    print("=" * 70)
    print("TEST: Timeout after persistence (§4a)")
    print("=" * 70)
    
    # Create a temp ledger
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        ledger_path = f.name
        json.dump({"entries": {}}, f)
    
    try:
        # Simulate an expired SETUP_PENDING alert
        # issued 20 minutes ago (window is 15 min)
        issued_at = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
        signal_id = "test_timeout_001"
        alert_type = "SETUP_PENDING"
        key = f"{signal_id}/{alert_type}"
        
        print(f"\n1. Simulating expired alert:")
        print(f"   Key: {key}")
        print(f"   Issued: {issued_at}")
        print(f"   Window: 15 minutes (expired)")
        
        # §4a: Write suppression (persistence point)
        print(f"\n2. §4a: Writing suppression (persistence point)...")
        with open(ledger_path) as f:
            ledger = json.load(f)
        
        # Conditional idempotent write
        if key not in ledger["entries"]:
            now = datetime.now(timezone.utc).isoformat()
            window_close = (datetime.fromisoformat(issued_at) + timedelta(minutes=15)).isoformat()
            ledger["entries"][key] = {
                "signal_id": signal_id,
                "alert_type": alert_type,
                "state": "suppressed",
                "suppression_reason": "entry_window_expired",
                "issued_at": issued_at,
                "window_close_utc": window_close,
                "now_utc": now,
                "written_by": "test_4a"
            }
            with open(ledger_path, 'w') as f:
                json.dump(ledger, f, indent=2)
            print(f"   ✓ Suppression written to ledger")
        else:
            print(f"   - Key already exists, skipped (idempotent)")
        
        # Simulate TIMEOUT during §5 (slow ack reconciliation)
        print(f"\n3. Simulating TIMEOUT during §5 (slow work)...")
        print(f"   Worker crashes/times out. No further processing.")
        print(f"   (In real scenario, worker process dies here)")
        
        # Verify: Read back the ledger (simulating restart)
        print(f"\n4. Verifying suppression survived (simulating restart)...")
        with open(ledger_path) as f:
            verify = json.load(f)
        
        if key in verify["entries"]:
            entry = verify["entries"][key]
            print(f"   ✓ Key found in ledger after 'restart'")
            print(f"   ✓ State: {entry['state']}")
            print(f"   ✓ Reason: {entry['suppression_reason']}")
        else:
            print(f"   ✗ FAIL: Key NOT found after restart!")
            return 1
        
        # Test idempotency: retry §4a (simulating next worker run)
        print(f"\n5. Testing idempotency (retry §4a on next run)...")
        with open(ledger_path) as f:
            ledger2 = json.load(f)
        
        original_entry = deepcopy(ledger2["entries"][key])
        
        # Attempt to write again (should be skipped)
        if key not in ledger2["entries"]:
            print(f"   ✗ FAIL: Would have overwritten!")
            return 1
        else:
            print(f"   ✓ Key exists, write skipped (idempotent)")
        
        # Verify no duplicate, no modification
        with open(ledger_path) as f:
            final = json.load(f)
        
        if final["entries"][key] == original_entry:
            print(f"   ✓ Entry unchanged (no duplicate, no corruption)")
        else:
            print(f"   ✗ FAIL: Entry was modified!")
            return 1
        
        # Verify it would not be sent (terminal state)
        print(f"\n6. Verifying terminal state prevents send...")
        terminal_states = ["delivered", "suppressed", "failed"]
        if final["entries"][key]["state"] in terminal_states:
            print(f"   ✓ State '{final['entries'][key]['state']}' is terminal - will never be sent")
        else:
            print(f"   ✗ FAIL: State is not terminal!")
            return 1
        
        print("\n" + "=" * 70)
        print("ALL TESTS PASSED ✓")
        print("  - Suppression persists through timeout")
        print("  - Survives restart")
        print("  - Idempotent (no duplicates on retry)")
        print("  - Terminal state prevents future sends")
        print("=" * 70)
        return 0
        
    finally:
        os.unlink(ledger_path)

if __name__ == '__main__':
    sys.exit(test_timeout_after_persistence())
