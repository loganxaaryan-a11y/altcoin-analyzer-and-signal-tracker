import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { acceptedIssuedSetupFromContract } from "./actions";
import type { DossierReplayOutput } from "./signal-methodology";

const acceptedScope: DossierReplayOutput["scope"] = {
  scoredLedger: { status: "reconstructed", reason: "accepted ledger" },
  rawSourceFactors: { status: "partial", reason: "provider adapters not replayed" },
  gates: { status: "partial", reason: "accepted gate scope" },
  levels: { status: "reconstructed", reason: "accepted levels" },
};

describe("final signoff action and client contract", () => {
  test("retry response deterministically returns the database-accepted immutable entry and levels", () => {
    const accepted = acceptedIssuedSetupFromContract({
      signalId: "sig-accepted",
      direction: "long",
      levelsJson: JSON.stringify({ entry: 100, stop: 95, target: 107.5, target2: 112.5 }),
      issuedAt: new Date("2026-10-09T12:00:00.000Z"),
      entryRule: "first-post-decision-provider-quote",
      priceBasis: "usd-spot-reference",
      inputSnapshotId: 41,
      gateResultsJson: JSON.stringify({ replayScope: acceptedScope }),
    }, {
      ...acceptedScope,
      levels: { status: "unverified", reason: "competing retry attempted different levels" },
    });
    expect(accepted).toEqual({
      signalId: "sig-accepted",
      direction: "long",
      entry: 100,
      stop: 95,
      target1: 107.5,
      target2: 112.5,
      issuedAt: "2026-10-09T12:00:00.000Z",
      entryRule: "first-post-decision-provider-quote",
      priceBasis: "usd-spot-reference",
      snapshotId: 41,
      reconstructionScope: acceptedScope,
    });
  });

  test("client labels issued levels separately from research-reference levels", () => {
    const client = readFileSync(new URL("../../client/src/App.tsx", import.meta.url), "utf8");
    expect(client).toContain("Accepted immutable contract");
    expect(client).toContain("Issued entry");
    expect(client).toContain("These immutable levels are the setup the evaluator grades.");
    expect(client).toContain("Research-reference view:");
    expect(client).toContain("cannot impersonate the issued setup above");
  });
});
