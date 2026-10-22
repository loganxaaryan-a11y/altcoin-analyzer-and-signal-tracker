-- 0049: Correct interpretation overreach in stored theory notes (Logan, 2026-10-15).
-- Wording-only correction. No measurement, signal, evaluation, ledger, or snapshot rows touched.
-- Originals are preserved verbatim in the comments below; only the interpretive sentences change.
-- Rows are targeted by id so the migration is a no-op where the rows differ.

-- theory_watch id 58 ("SUI leads selective L1 rotation vs BTC as memes bleed", agent cross-market synthesis):
-- ORIGINAL POSITIONING layer evidence: "Blended 8H funding -2.73 sigma vs 30D (longs building into weakness, OI +0.8%); Hyperliquid leaderboard accounts net long $28.7M vs $13.9M short with a large NEAR long."
-- Negative funding + rising OI does not establish "longs building"; rewrite as observed facts.
UPDATE `theory_watch` SET `layers_json` = REPLACE(`layers_json`, '(longs building into weakness, OI +0.8%)', '(unusually negative funding while OI rose +0.8%; aggregate OI does not identify which side added exposure)') WHERE `id` = 58;
--> statement-breakpoint
-- ORIGINAL thesis fragment: "positioning showing longs building into weakness (funding -2.73 sigma vs 30D)"
UPDATE `theory_watch` SET `thesis` = REPLACE(`thesis`, 'positioning showing longs building into weakness (funding -2.73 sigma vs 30D)', 'positioning showing unusually negative funding (-2.73 sigma vs 30D) alongside rising OI (+0.8%); aggregate OI does not identify which side added exposure') WHERE `id` = 58;
--> statement-breakpoint
-- ORIGINAL forwardLook fragment: "whether longs-building-into-weakness funding converts into spot follow-through or unwinds"
UPDATE `theory_watch` SET `forward_look` = REPLACE(`forward_look`, 'whether longs-building-into-weakness funding converts into spot follow-through or unwinds', 'whether this negative-funding / rising-OI configuration converts into spot follow-through or unwinds') WHERE `id` = 58;
--> statement-breakpoint
-- theory_watch id 39 ("Advisor Spot-to-ETF Swaps Anchor SOL's Regulated Demand Base"):
-- ORIGINAL headline: "Advisor Spot-to-ETF Swaps Anchor SOL's Regulated Demand Base"
-- ORIGINAL thesis: "Signal 7 (SOL) is high-tier, 4/5 severe gates with no failed gate, complete price/turnover/funding/OI data, cross-horizon alignment and 65/100 alignment. Source 0 reports advisors who held spot SOL with custodians now seek to swap into ETF shares in Q3 for simplicity and peace of mind. Source 5 shows Solana ETFs added $26.1M on Sept 21 while BTC ETFs saw ~$998M outflows and XRP flat, indicating SOL-specific allocation during rotation. Measured strength plus two independent ETF reports align on durable regulated-access demand."
-- Converting existing spot holdings into ETF shares does not automatically establish new net demand;
-- the thesis must distinguish a change in vehicle from new net inflow.
UPDATE `theory_watch` SET `headline` = 'Advisor Spot-to-ETF Swaps Shift SOL Toward Regulated Vehicles' WHERE `id` = 39 AND `headline` = 'Advisor Spot-to-ETF Swaps Anchor SOL''s Regulated Demand Base';
--> statement-breakpoint
UPDATE `theory_watch` SET `thesis` = REPLACE(`thesis`, 'now seek to swap into ETF shares in Q3 for simplicity and peace of mind. Source 5', 'now seek to swap into ETF shares in Q3 for simplicity and peace of mind -- a change in vehicle that does not by itself establish new net demand. Source 5') WHERE `id` = 39;
--> statement-breakpoint
UPDATE `theory_watch` SET `thesis` = REPLACE(`thesis`, 'Measured strength plus two independent ETF reports align on durable regulated-access demand.', 'Measured strength plus two independent ETF reports align on regulated-access interest; whether the spot-to-ETF swaps represent new net inflow remains unverified.') WHERE `id` = 39;
