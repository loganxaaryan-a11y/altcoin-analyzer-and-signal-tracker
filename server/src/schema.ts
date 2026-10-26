import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const journalTrades = sqliteTable("journal_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  side: text("side", { enum: ["long", "short"] }).notNull(),
  entry: real("entry").notNull(),
  stop: real("stop").notNull(),
  target: real("target"),
  exit: real("exit"),
  size: real("size"),
  leverage: real("leverage"),
  setupType: text("setup_type").notNull().default("manual"),
  status: text("status", { enum: ["planned", "open", "closed"] }).notNull(),
  checkVerdict: text("check_verdict", { enum: ["good", "caution", "bad"] }),
  checkSnapshotJson: text("check_snapshot_json"),
  outcomeR: real("outcome_r"),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const tradingRules = sqliteTable("trading_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const watchlist = sqliteTable("watchlist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coinId: text("coin_id").notNull().unique(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const generatedSignals = sqliteTable("generated_signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  issuanceKey: text("issuance_key").unique(),
  coinId: text("coin_id").notNull(), name: text("name").notNull(), symbol: text("symbol").notNull(),
  direction: text("direction", { enum: ["long", "short"] }).notNull(), confidence: real("confidence").notNull(), setupType: text("setup_type").notNull(),
  entry: real("entry").notNull(), invalidation: real("invalidation").notNull(), target1: real("target1").notNull(), target2: real("target2").notNull(),
  atr14: real("atr14"), riskMultiplier: real("risk_multiplier"), riskMethod: text("risk_method", { enum: ["legacy_fixed", "atr14_1_25x"] }).notNull().default("legacy_fixed"),
  funding: real("funding"), oiUsd: real("oi_usd"), oiChange: real("oi_change"),
  factorsJson: text("factors_json").notNull().default("[]"), sourceAsOf: integer("source_as_of", { mode: "timestamp_ms" }),
  outcome5: text("outcome_5"), outcome14: text("outcome_14"), outcome30: text("outcome_30"),
  return5: real("return_5"), return14: real("return_14"), return30: real("return_30"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const suppressedSignalCandidates = sqliteTable("suppressed_signal_candidates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coinId: text("coin_id").notNull(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  direction: text("direction", { enum: ["long", "short"] }).notNull(),
  source: text("source", { enum: ["dossier", "market_discovery"] }).notNull(),
  reason: text("reason").notNull(),
  signalDay: text("signal_day").notNull(),
  entry: real("entry"),
  invalidation: real("invalidation"),
  target1: real("target_1"),
  target2: real("target_2"),
  candleOpen: real("candle_open"),
  candleHigh: real("candle_high"),
  candleLow: real("candle_low"),
  candleClose: real("candle_close"),
  candleSource: text("candle_source"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("suppressed_signal_candidates_day_coin_direction_reason_uidx").on(table.signalDay, table.coinId, table.direction, table.reason),
  index("suppressed_signal_candidates_created_at_idx").on(table.createdAt),
]);

export const signalInterimSnapshots = sqliteTable("signal_interim_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  signalId: integer("signal_id").notNull(),
  coinId: text("coin_id").notNull(),
  symbol: text("symbol").notNull(),
  capturedDay: text("captured_day").notNull(),
  currentPrice: real("current_price").notNull(),
  returnPct: real("return_pct").notNull(),
  distanceTarget1Pct: real("distance_target1_pct").notNull(),
  distanceInvalidationPct: real("distance_invalidation_pct").notNull(),
  daysSinceEntry: integer("days_since_entry").notNull(),
  capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("signal_interim_snapshots_signal_day_unique").on(table.signalId, table.capturedDay),
  index("signal_interim_snapshots_signal_idx").on(table.signalId),
]);

export const signalSnapshotCorrections = sqliteTable("signal_snapshot_corrections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  signalId: integer("signal_id").notNull(),
  snapshotRowId: integer("snapshot_row_id").notNull(),
  capturedDay: text("captured_day").notNull(),
  fieldName: text("field_name").notNull(),
  oldValue: real("old_value").notNull(),
  newValue: real("new_value").notNull(),
  actor: text("actor").notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("signal_snapshot_corrections_snapshot_idx").on(table.snapshotRowId),
  index("signal_snapshot_corrections_signal_day_idx").on(table.signalId, table.capturedDay),
]);

export const signalDailyBriefs = sqliteTable("signal_daily_briefs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  capturedDay: text("captured_day").notNull().unique(),
  summary: text("summary").notNull(),
  trackedCount: integer("tracked_count").notNull(),
  approachingTargetCount: integer("approaching_target_count").notNull(),
  approachingInvalidationCount: integer("approaching_invalidation_count").notNull(),
  sourceAsOf: integer("source_as_of", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const alerts = sqliteTable("alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }), coinId: text("coin_id").notNull(), symbol: text("symbol").notNull(),
  type: text("type", { enum: ["entry", "funding", "oi", "whale", "unlock"] }).notNull(), threshold: real("threshold"), wallet: text("wallet"), enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const alertHits = sqliteTable("alert_hits", {
  id: integer("id").primaryKey({ autoIncrement: true }), alertId: integer("alert_id").notNull(), coinId: text("coin_id").notNull(), symbol: text("symbol").notNull(),
  message: text("message").notNull(), source: text("source").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const marketSnapshots = sqliteTable("market_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coinId: text("coin_id").notNull(),
  price: real("price"),
  dexLiquidity: real("dex_liquidity"),
  dexVolume24h: real("dex_volume_24h"),
  dexBuys24h: integer("dex_buys_24h"),
  dexSells24h: integer("dex_sells_24h"),
  capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const historicalDailyBars = sqliteTable("historical_daily_bars", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coinId: text("coin_id").notNull(),
  symbol: text("symbol").notNull(),
  day: text("day").notNull(),
  ts: integer("ts").notNull(),
  open: real("open"),
  high: real("high"),
  low: real("low"),
  close: real("close").notNull(),
  volume: real("volume"),
  source: text("source", { enum: ["binance", "mexc", "coingecko", "coinpaprika"] }).notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const historicalMetrics = sqliteTable("historical_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coinId: text("coin_id").notNull(),
  symbol: text("symbol").notNull(),
  metric: text("metric", { enum: ["funding"] }).notNull(),
  ts: integer("ts").notNull(),
  value: real("value").notNull(),
  source: text("source").notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const historyCacheState = sqliteTable("history_cache_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coinId: text("coin_id").notNull().unique(),
  symbol: text("symbol").notNull(),
  source: text("source", { enum: ["binance", "mexc", "coingecko", "coinpaprika"] }).notNull(),
  firstBarTs: integer("first_bar_ts"),
  lastBarTs: integer("last_bar_ts"),
  barCount: integer("bar_count").notNull().default(0),
  fundingCount: integer("funding_count").notNull().default(0),
  lastRefreshAt: integer("last_refresh_at", { mode: "timestamp_ms" }),
  lastError: text("last_error"),
});

export const theories = sqliteTable("theories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  statement: text("statement").notNull(),
  horizon: text("horizon", { enum: ["short", "long"] }).notNull(),
  linkedCoinsJson: text("linked_coins_json").notNull(),
  rippleMap: text("ripple_map").notNull(),
  priceSnapshotsJson: text("price_snapshots_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const theoryPredictions = sqliteTable("theory_predictions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  theoryId: integer("theory_id").notNull(),
  coinId: text("coin_id").notNull(),
  symbol: text("symbol").notNull(),
  direction: text("direction", { enum: ["above", "below"] }).notNull(),
  targetPrice: real("target_price"),
  dueDate: text("due_date").notNull(),
});

export const theoryEvidence = sqliteTable("theory_evidence", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  theoryId: integer("theory_id").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  source: text("source").notNull(),
  stance: text("stance", { enum: ["confirming", "challenging"] }).notNull(),
  publishedAt: text("published_at"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const theoryWatch = sqliteTable("theory_watch", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  machineKey: text("machine_key").notNull().unique(),
  sector: text("sector").notNull(),
  mode: text("mode", { enum: ["directional", "contested"] }).notNull(),
  direction: text("direction", { enum: ["bullish", "bearish", "none"] }).notNull(),
  status: text("status", { enum: ["live", "contested", "invalidated"] }).notNull(),
  confidence: text("confidence", { enum: ["high", "medium", "low"] }).notNull(),
  headline: text("headline").notNull(),
  thesis: text("thesis").notNull(),
  forwardLook: text("forward_look").notNull(),
  countercase: text("countercase").notNull(),
  invalidation: text("invalidation").notNull(),
  linkedSymbol: text("linked_symbol").notNull(),
  layersJson: text("layers_json").notNull(),
  sourcesJson: text("sources_json").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  invalidationReason: text("invalidation_reason"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  invalidatedAt: integer("invalidated_at", { mode: "timestamp_ms" }),
}, (table) => [
  index("theory_watch_created_id_idx").on(table.createdAt, table.id),
]);

// Theory withdrawals (2026-10-18, asset-accuracy workstream): append-only
// withdrawal/correction records for theory_watch rows. The original theory row
// is NEVER modified or deleted; readers exclude withdrawn theories from lead
// selection and summaries, and surface them in explicitly labeled history.
// Migration 0057 (nonconflicting: target tree journal ends at 0056).
export const theoryWithdrawals = sqliteTable("theory_withdrawals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  theoryId: integer("theory_id").notNull(),
  reason: text("reason", { enum: ["cross_asset_misattribution", "factual_error", "superseded"] }).notNull(),
  evidenceJson: text("evidence_json").notNull(),
  withdrawnAt: integer("withdrawn_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  withdrawnBy: text("withdrawn_by").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
}, (table) => [
  index("theory_withdrawals_theory_idx").on(table.theoryId),
]);

export const onchainFlowSnapshots = sqliteTable("onchain_flow_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coin: text("coin").notNull().unique(),
  asOf: integer("as_of", { mode: "timestamp_ms" }).notNull(),
  flowsJson: text("flows_json").notNull(),
  source: text("source", { enum: ["Etherscan"] }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("onchain_flow_snapshots_as_of_idx").on(table.asOf),
]);

export const engineHits = sqliteTable("engine_hits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engineKey: text("engine_key").notNull().unique(),
  theoryWatchId: integer("theory_watch_id").notNull(),
  thesis: text("thesis").notNull(),
  triggeringEvent: text("triggering_event").notNull(),
  evidenceJson: text("evidence_json").notNull(),
  engineScore: integer("engine_score").notNull(),
  scoreBasis: text("score_basis").notNull(),
  tapeState: text("tape_state", { enum: ["bullish", "bearish", "mixed", "neutral"] }).notNull(),
  rippleChainJson: text("ripple_chain_json").notNull(),
  eventAt: integer("event_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const engineHitNotifications = sqliteTable("engine_hit_notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  engineHitId: integer("engine_hit_id").notNull(),
  status: text("status", { enum: ["pending", "sent"] }).notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  // Terminal-first delivery (migration 0064): stamped by the digest job
  // after a successful chat send. Distinct from read state (status/sentAt,
  // set only by the user's ack); the digest never touches read state.
  chatSentAt: integer("chat_sent_at", { mode: "timestamp_ms" }),
}, (table) => [
  index("engine_hit_notifications_status_created_idx").on(table.status, table.createdAt),
]);

// Discovery informational notifications (2026-10-16): discovery-qualified
// opportunities that are BLOCKED from paper issuance. INFORMATIONAL ONLY —
// the blocker disclosed here still blocks paper entry; this is a notification
// lane, not an issuance bypass. The workspace delivery path consumes via
// getPendingDiscoveryNotifications / ackDiscoveryNotification.
export const discoveryInformationalNotifications = sqliteTable("discovery_informational_notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull().default("INFORMATIONAL"),
  coinId: text("coin_id").notNull(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  direction: text("direction", { enum: ["long", "short"] }).notNull(),
  entry: real("entry"),
  invalidation: real("invalidation"),
  target1: real("target1"),
  target2: real("target2"),
  triggerReasonsJson: text("trigger_reasons_json").notNull(),
  blockerReason: text("blocker_reason").notNull(),
  disclosure: text("disclosure").notNull(),
  discoveryRunId: integer("discovery_run_id"),
  signalDay: text("signal_day").notNull(),
  status: text("status", { enum: ["pending", "sent"] }).notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  // Terminal-first delivery (migration 0064): the candidate's frozen window
  // close where one exists, else null ("no expiry recorded"). Never computed
  // as createdAt + window. chatSentAt is stamped only by the digest job
  // after a successful chat send; it never touches read state.
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  chatSentAt: integer("chat_sent_at", { mode: "timestamp_ms" }),
}, (table) => [
  index("discovery_informational_notifications_status_created_idx").on(table.status, table.createdAt),
]);

// Append-only dispositions for discovery informational notifications
// (migration 0071): recorded when a discovery slot closes WITHOUT an
// issuance handoff — a coverage gap — and the candidate's entry window
// expires unissued. The original notification row is NEVER rewritten;
// the read model resolves the notification's displayed state from this
// disposition instead of leaving it AWAITING_ISSUANCE forever (the
// notification-621 case: discovery run 191 stalled in scoring, no
// handoff was ever produced, and the dead slot kept reading as though
// issuance was still coming). One disposition per notification.
export const discoveryNotificationDispositions = sqliteTable("discovery_notification_dispositions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  notificationId: integer("notification_id").notNull(),
  discoveryRunId: integer("discovery_run_id"),
  disposition: text("disposition", { enum: ["coverage_gap_expired_unissued"] }).notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("discovery_notification_dispositions_notification_uidx").on(table.notificationId),
  index("discovery_notification_dispositions_run_idx").on(table.discoveryRunId),
]);

export const schedulerInvocationReceipts = sqliteTable("scheduler_invocation_receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobKey: text("job_key", { enum: ["market_data_refresh", "market_discovery_scan", "signal_status_monitor", "history_layer_refresh", "paper_entry_watch", "theory_discovery", "universe_daily_snapshot", "universe_weekly_refresh", "signal_daily_postmortem"] }).notNull(),
  jobName: text("job_name").notNull(),
  runId: text("run_id").notNull().unique(),
  status: text("status", { enum: ["running", "succeeded", "failed"] }).notNull(),
  invokedAt: integer("invoked_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  deployedVersion: text("deployed_version"),
  triggerProvenance: text("trigger_provenance", { enum: ["scheduler", "manual"] }),
  progressJson: text("progress_json"),
  error: text("error"),
}, (table) => [
  index("scheduler_invocation_receipts_job_invoked_idx").on(table.jobKey, table.invokedAt),
]);

export const theoryDiscoveryRuns = sqliteTable("theory_discovery_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status", { enum: ["complete", "degraded", "failed"] }).notNull(),
  summary: text("summary").notNull(),
  sourceStatusJson: text("source_status_json").notNull(),
  discovered: integer("discovered").notNull().default(0),
  contested: integer("contested").notNull().default(0),
  invalidated: integer("invalidated").notNull().default(0),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const theoryDiscoveryCandidateBatches = sqliteTable("theory_discovery_candidate_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status", { enum: ["pending", "processing", "complete", "failed"] }).notNull().default("pending"),
  evidenceJson: text("evidence_json").notNull(),
  sourceStatusJson: text("source_status_json").notNull(),
  invalidated: integer("invalidated").notNull().default(0),
  collectionSummary: text("collection_summary").notNull(),
  synthesisSummary: text("synthesis_summary"),
  consumedTheoryId: integer("consumed_theory_id"),
  consumeAttempts: integer("consume_attempts").notNull().default(0),
  lastConsumeAttemptAt: integer("last_consume_attempt_at", { mode: "timestamp_ms" }),
  collectedAt: integer("collected_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  processingAt: integer("processing_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
}, (table) => [
  index("theory_candidate_batches_status_id_idx").on(table.status, table.id),
]);

export const marketSyntheses = sqliteTable("market_syntheses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status", { enum: ["complete", "degraded", "failed"] }).notNull(),
  direction: text("direction", { enum: ["bullish", "bearish", "mixed", "no_data"] }).notNull(),
  headline: text("headline").notNull(),
  summary: text("summary").notNull(),
  claimsJson: text("claims_json").notNull(),
  evidenceJson: text("evidence_json").notNull(),
  categoryMarksJson: text("category_marks_json").notNull(),
  sourceStatusJson: text("source_status_json").notNull(),
  candidateCount: integer("candidate_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("market_syntheses_created_at_idx").on(table.createdAt),
]);

export const marketDiscoveryRuns = sqliteTable("market_discovery_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status", { enum: ["running", "complete", "degraded", "empty", "failed", "timeout", "missed"] }).notNull(),
  universeSize: integer("universe_size").notNull().default(0),
  shortlisted: integer("shortlisted").notNull().default(0),
  signalCount: integer("signal_count").notNull().default(0),
  newsCount: integer("news_count").notNull().default(0),
  theoryCount: integer("theory_count").notNull().default(0),
  summary: text("summary").notNull(),
  sourceStatusJson: text("source_status_json").notNull(),
  leaseId: text("lease_id"),
  deadlineAt: integer("deadline_at", { mode: "timestamp_ms" }),
  lastCheckpointStage: text("last_checkpoint_stage"),
  lastHeartbeatAt: integer("last_heartbeat_at", { mode: "timestamp_ms" }),
  tierLaneStatus: text("tier_lane_status"),
  velocityLaneStatus: text("velocity_lane_status"),
  // paper-pilot-v2.1.7 activation (migration 0072): every discovery run
  // records the active mapping/admission version, the frozen pilot
  // universe with per-run present/deferred dispositions, and the pilot
  // lane status. Null on pre-activation runs — never backfilled.
  admissionVersion: text("admission_version"),
  pilotUniverseJson: text("pilot_universe_json"),
  pilotLaneStatus: text("pilot_lane_status"),
  stageDurationsJson: text("stage_durations_json").notNull().default("{}"),
  dependencyValidationJson: text("dependency_validation_json").notNull().default("{}"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("market_discovery_runs_status_deadline_idx").on(table.status, table.deadlineAt),
]);

export const marketDiscoveryCheckpoints = sqliteTable("market_discovery_checkpoints", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull(),
  leaseId: text("lease_id").notNull(),
  stage: text("stage").notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull(),
  durationMs: integer("duration_ms").notNull(),
  countsJson: text("counts_json").notNull(),
}, (table) => [
  uniqueIndex("market_discovery_checkpoints_run_stage_uidx").on(table.runId, table.stage),
]);

export const discoveryState = sqliteTable("discovery_state", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const apiCreditBudgets = sqliteTable("api_credit_budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull(),
  scope: text("scope").notNull(),
  budgetDay: text("budget_day").notNull(),
  creditsUsed: integer("credits_used").notNull().default(0),
  lastReservationId: text("last_reservation_id").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("api_credit_budgets_provider_scope_day_uidx").on(table.provider, table.scope, table.budgetDay),
]);

export const discoverySignals = sqliteTable("discovery_signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull(),
  firstSeenRunId: integer("first_seen_run_id").notNull(),
  latestRunId: integer("latest_run_id").notNull(),
  coinId: text("coin_id").notNull().unique(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  rank: integer("rank"),
  sector: text("sector").notNull(),
  direction: text("direction", { enum: ["long", "short", "watch"] }).notNull(),
  alignment: integer("alignment").notNull(),
  setupType: text("setup_type").notNull(),
  price: real("price"),
  firstSeenPrice: real("first_seen_price"),
  firstSeenDirection: text("first_seen_direction", { enum: ["long", "short", "watch"] }),
  firstSeenSourceAsOf: integer("first_seen_source_as_of", { mode: "timestamp_ms" }),
  change1h: real("change_1h"),
  change24h: real("change_24h"),
  change7d: real("change_7d"),
  change30d: real("change_30d"),
  turnover: real("turnover"),
  volume24h: real("volume_24h"),
  marketCap: real("market_cap"),
  funding: real("funding"),
  openInterestUsd: real("open_interest_usd"),
  reasonsJson: text("reasons_json").notNull(),
  confidenceTier: text("confidence_tier", { enum: ["high", "medium", "low"] }).notNull().default("low"),
  passedDimensions: integer("passed_dimensions").notNull().default(0),
  researchState: text("research_state", { enum: ["validated", "research_required", "monitor"] }).notNull().default("research_required"),
  dimensionsJson: text("dimensions_json").notNull().default("[]"),
  discoveryTier: text("discovery_tier", { enum: ["tier1", "tier2"] }).notNull().default("tier1"),
  // paper-pilot-v2.1.7 (migration 0072): the admission lane(s) this
  // signal entered full scoring through — t1 / velocity keep their
  // v2.1.6 meanings, binance_pilot is the v2.1.7 addition. Plain text:
  // combined lanes are stored joined with "+". 'legacy' on old rows.
  admissionLane: text("admission_lane").default("legacy"),
  discoveryLane: text("discovery_lane", { enum: ["main", "meme"] }).notNull().default("main"),
  triggerReasonsJson: text("trigger_reasons_json").notNull().default("[]"),
  socialSnapshotJson: text("social_snapshot_json"),
  memeValidationJson: text("meme_validation_json"),
  invalidationLevel: real("invalidation_level"),
  sourceAsOf: integer("source_as_of", { mode: "timestamp_ms" }),
  outcome5: text("outcome_5", { enum: ["hit", "miss"] }),
  outcome14: text("outcome_14", { enum: ["hit", "miss"] }),
  outcome30: text("outcome_30", { enum: ["hit", "miss"] }),
  return5: real("return_5"),
  return14: real("return_14"),
  return30: real("return_30"),
  capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const methodologyFreezes = sqliteTable("methodology_freezes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  version: text("version").notNull().unique(),
  versionHash: text("version_hash").notNull(),
  frozenAt: integer("frozen_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status", { enum: ["frozen_for_measurement"] }).notNull(),
  specJson: text("spec_json").notNull(),
});

export const universeDailySnapshots = sqliteTable("universe_daily_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }), capturedDay: text("captured_day").notNull(), capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull(), methodologyVersion: text("methodology_version").notNull(), coinId: text("coin_id").notNull(), symbol: text("symbol").notNull(), candidateState: text("candidate_state", { enum: ["issued", "suppressed", "dossier"] }).notNull(), direction: text("direction").notNull(), ohlcJson: text("ohlc_json").notNull(), factorsJson: text("factors_json").notNull(), venuesJson: text("venues_json").notNull(), realizedFundingJson: text("realized_funding_json").notNull(), sourceAsOf: integer("source_as_of", { mode: "timestamp_ms" }),
}, (table) => [uniqueIndex("universe_daily_snapshots_day_coin_unique").on(table.capturedDay, table.coinId), index("universe_daily_snapshots_day_idx").on(table.capturedDay)]);

export const dossierVerdictSnapshots = sqliteTable("dossier_verdict_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }), capturedDay: text("captured_day").notNull(), capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull(), methodologyVersion: text("methodology_version").notNull(), coinId: text("coin_id").notNull(), symbol: text("symbol").notNull(), direction: text("direction").notNull(), convictionMode: text("conviction_mode", { enum: ["chart-led", "event-led", "confluence", "quiet"] }).notNull(), score: real("score").notNull(), invalidation: real("invalidation"), sourceAsOf: integer("source_as_of", { mode: "timestamp_ms" }), recordScope: text("record_scope", { enum: ["diagnosis_only"] }).notNull().default("diagnosis_only"), payloadJson: text("payload_json").notNull(),
}, (table) => [uniqueIndex("dossier_verdict_day_coin_unique").on(table.capturedDay, table.coinId)]);

export const passBarSettings = sqliteTable("pass_bar_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  version: text("version").notNull().unique(),
  averageNetRMin: real("average_net_r_min").notNull(),
  wilsonAboveBaseline: integer("wilson_above_baseline", { mode: "boolean" }).notNull(),
  minClosedCalls: integer("min_closed_calls").notNull(),
  factorActiveN: integer("factor_active_n").notNull(),
  factorInactiveN: integer("factor_inactive_n").notNull(),
  signedOff: integer("signed_off", { mode: "boolean" }).notNull(),
  signedOffAt: integer("signed_off_at", { mode: "timestamp_ms" }),
  signedOffDate: text("signed_off_date"),
  definitionJson: text("definition_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const realizedFundingPayments = sqliteTable("realized_funding_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  signalId: integer("signal_id").notNull(),
  coinId: text("coin_id").notNull(),
  paymentDay: text("payment_day").notNull(),
  paymentR: real("payment_r").notNull(),
  source: text("source").notNull(),
  recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("realized_funding_payments_signal_day_source_unique").on(table.signalId, table.paymentDay, table.source),
  index("realized_funding_payments_day_idx").on(table.paymentDay),
]);

export const timingIntegrityAudits = sqliteTable("timing_integrity_audits", {
  id: integer("id").primaryKey({ autoIncrement: true }), symbol: text("symbol").notNull(), signalId: integer("signal_id"), signalAt: integer("signal_at", { mode: "timestamp_ms" }), timestampState: text("timestamp_state", { enum: ["verified", "unverified"] }).notNull(), candleState: text("candle_state", { enum: ["backfilled", "unverifiable"] }).notNull(), candleSource: text("candle_source"), preSignalBars: integer("pre_signal_bars").notNull(), factorLedgerState: text("factor_ledger_state", { enum: ["original", "unverified_not_reconstructed"] }).notNull(), note: text("note").notNull(), checkedAt: integer("checked_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("timing_integrity_audits_symbol_idx").on(table.symbol)]);

export const reversePatternDefinitions = sqliteTable("reverse_pattern_definitions", {
  id: integer("id").primaryKey({ autoIncrement: true }), version: text("version").notNull().unique(), name: text("name").notNull(), criteriaJson: text("criteria_json").notNull(), outcomeRule: text("outcome_rule").notNull(), holdoutRule: text("holdout_rule").notNull(), frozenAt: integer("frozen_at", { mode: "timestamp_ms" }).notNull(),
});

export const universeTierRuns = sqliteTable("universe_tier_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status", { enum: ["complete", "degraded", "failed"] }).notNull(),
  universeCount: integer("universe_count").notNull().default(0),
  volumePassCount: integer("volume_pass_count").notNull().default(0),
  t3Count: integer("t3_count").notNull().default(0),
  t2Count: integer("t2_count").notNull().default(0),
  t1Count: integer("t1_count").notNull().default(0),
  summary: text("summary").notNull(),
  sourceStatusJson: text("source_status_json").notNull(),
  supersededByRunId: integer("superseded_by_run_id"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("universe_tier_runs_superseded_idx").on(table.supersededByRunId),
]);

export const universeTiers = sqliteTable("universe_tiers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull(),
  coinId: text("coin_id").notNull().unique(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  tier: text("tier", { enum: ["T1", "T2", "T3", "T4"] }).notNull(),
  reason: text("reason").notNull(),
  assignedAt: integer("assigned_at", { mode: "timestamp_ms" }).notNull(),
  graduationScore: integer("graduation_score"),
  volumeScore: integer("volume_score").notNull().default(0),
  holdersScore: integer("holders_score").notNull().default(0),
  whalesScore: integer("whales_score").notNull().default(0),
  holderGrowthPct: real("holder_growth_pct"),
  whaleNetflow24hUsd: real("whale_netflow_24h_usd"),
  onchainWitnessSource: text("onchain_witness_source"),
  onchainWitnessAsOf: integer("onchain_witness_as_of", { mode: "timestamp_ms" }),
  catalystScore: integer("catalyst_score").notNull().default(0),
  structureScore: integer("structure_score").notNull().default(0),
  volumeRank: integer("volume_rank"),
  marketCapRank: integer("market_cap_rank"),
  price: real("price"),
  volume24h: real("volume_24h"),
  volumeMultiple30d: real("volume_multiple_30d"),
  change48h: real("change_48h"),
  athChangePct: real("ath_change_pct"),
  nearStructuralDowntrend: integer("near_structural_downtrend", { mode: "boolean" }).notNull().default(false),
  sma50: real("sma_50"),
  rsi14: real("rsi_14"),
  historyDays: integer("history_days").notNull().default(0),
  chartSource: text("chart_source", { enum: ["live", "stored"] }),
  chartAgeH: real("chart_age_h"),
  chartPass: integer("chart_pass", { mode: "boolean" }).notNull().default(false),
  thinData: integer("thin_data", { mode: "boolean" }).notNull().default(false),
  rsiFlag: integer("rsi_flag", { mode: "boolean" }).notNull().default(false),
  stablecoin: integer("stablecoin", { mode: "boolean" }).notNull().default(false),
  mover: integer("mover", { mode: "boolean" }).notNull().default(false),
  moverReason: text("mover_reason"),
  catalystLine: text("catalyst_line"),
  newListing: integer("new_listing", { mode: "boolean" }).notNull().default(false),
  outsideT2Weeks: integer("outside_t2_weeks").notNull().default(0),
  lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }),
  sourceAsOf: integer("source_as_of", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("universe_tiers_tier_volume_idx").on(table.tier, table.volumeRank),
]);

export const universeTierLogs = sqliteTable("universe_tier_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull(),
  coinId: text("coin_id").notNull(),
  symbol: text("symbol").notNull(),
  tier: text("tier", { enum: ["T1", "T2", "T3", "T4"] }).notNull(),
  reason: text("reason").notNull(),
  graduationScore: integer("graduation_score"),
  assignedAt: integer("assigned_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("universe_tier_logs_coin_time_idx").on(table.coinId, table.assignedAt),
]);

export const discoveryNews = sqliteTable("discovery_news", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  source: text("source").notNull(),
  publishedAt: text("published_at"),
  whyItMatters: text("why_it_matters").notNull(),
  impactsJson: text("impacts_json").notNull(),
  assetTagsJson: text("asset_tags_json").notNull(),
  verification: text("verification").notNull(),
  retrievedAt: integer("retrieved_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const signalInputSnapshots = sqliteTable("signal_input_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  snapshotHash: text("snapshot_hash").notNull().unique(),
  snapshotVersion: text("snapshot_version").notNull(),
  assetId: text("asset_id").notNull(),
  providerMetadataJson: text("provider_metadata_json").notNull(),
  payloadJson: text("payload_json").notNull(),
  capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull(),
  availableAt: integer("available_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("signal_input_snapshots_asset_time_idx").on(table.assetId, table.capturedAt),
]);

export const signalContracts = sqliteTable("signal_contracts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  signalId: text("signal_id").notNull().unique(),
  legacySignalId: integer("legacy_signal_id").unique(),
  amendsSignalId: text("amends_signal_id"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  issuanceClaim: text("issuance_claim"),
  issuanceState: text("issuance_state", { enum: ["pending", "complete", "failed"] }).notNull().default("pending"),
  entryEvidenceJson: text("entry_evidence_json").notNull().default("{}"),
  evaluatorVersion: text("evaluator_version"),
  assetId: text("asset_id").notNull(),
  symbol: text("symbol").notNull(),
  venue: text("venue").notNull(),
  instrumentType: text("instrument_type").notNull(),
  exchangeCalendar: text("exchange_calendar").notNull(),
  direction: text("direction", { enum: ["long", "short"] }).notNull(),
  strategyId: text("strategy_id").notNull(),
  strategyVersion: text("strategy_version").notNull(),
  parameterHash: text("parameter_hash").notNull(),
  buildId: text("build_id").notNull(),
  decisionAt: integer("decision_at", { mode: "timestamp_ms" }).notNull(),
  availableAt: integer("available_at", { mode: "timestamp_ms" }).notNull(),
  issuedAt: integer("issued_at", { mode: "timestamp_ms" }).notNull(),
  entryAt: integer("entry_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  inputSnapshotId: integer("input_snapshot_id").notNull(),
  barStart: integer("bar_start", { mode: "timestamp_ms" }).notNull(),
  barEnd: integer("bar_end", { mode: "timestamp_ms" }).notNull(),
  barIsClosed: integer("bar_is_closed", { mode: "boolean" }).notNull(),
  priceBasis: text("price_basis").notNull(),
  entryRule: text("entry_rule").notNull(),
  entryPrice: real("entry_price").notNull(),
  stopPrice: real("stop_price").notNull(),
  targetPrice: real("target_price").notNull(),
  riskPerUnit: real("risk_per_unit").notNull(),
  primaryHorizon: integer("primary_horizon").notNull(),
  horizonUnit: text("horizon_unit").notNull(),
  featureValuesJson: text("feature_values_json").notNull(),
  gateResultsJson: text("gate_results_json").notNull(),
  setupScore: real("setup_score").notNull(),
  scoreDefinition: text("score_definition").notNull(),
  dataCoverageJson: text("data_coverage_json").notNull(),
  validationStatus: text("validation_status", { enum: ["unverified_prospective", "partially_testable", "validated", "watch_only"] }).notNull(),
  levelsJson: text("levels_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("signal_contracts_asset_issued_idx").on(table.assetId, table.issuedAt),
]);

export const signalOutcomeEvents = sqliteTable("signal_outcome_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  signalId: text("signal_id").notNull(),
  eventType: text("event_type", { enum: ["observation", "settlement", "correction"] }).notNull(),
  methodVersion: text("method_version").notNull(),
  outcome: text("outcome", { enum: ["target", "invalidated", "time_exit", "ambiguous", "unverified", "open"] }).notNull(),
  observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(),
  exitAt: integer("exit_at", { mode: "timestamp_ms" }),
  exitPrice: real("exit_price"),
  grossReturnPct: real("gross_return_pct"),
  netReturnPct: real("net_return_pct"),
  grossR: real("gross_r"),
  netR: real("net_r"),
  evidenceSnapshotId: integer("evidence_snapshot_id"),
  reason: text("reason").notNull(),
  uncertaintyJson: text("uncertainty_json").notNull(),
  previousEventId: integer("previous_event_id"),
  eventHash: text("event_hash").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("signal_outcome_events_signal_time_idx").on(table.signalId, table.createdAt),
]);

export const signalEvaluations = sqliteTable("signal_evaluations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  signalId: text("signal_id").notNull(),
  legacySignalId: integer("legacy_signal_id"),
  methodVersion: text("method_version").notNull(),
  product: text("product", { enum: ["direction_forecast", "trade_setup"] }).notNull(),
  horizon: integer("horizon").notNull(),
  horizonUnit: text("horizon_unit").notNull(),
  oldVerdict: text("old_verdict"),
  newVerdict: text("new_verdict").notNull(),
  status: text("status", { enum: ["resolved", "ambiguous", "unverified", "open"] }).notNull(),
  reason: text("reason").notNull(),
  evidenceJson: text("evidence_json").notNull(),
  grossReturnPct: real("gross_return_pct"),
  netReturnPct: real("net_return_pct"),
  grossR: real("gross_r"),
  netR: real("net_r"),
  evaluatedAt: integer("evaluated_at", { mode: "timestamp_ms" }).notNull(),
  maturesAt: integer("matures_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("signal_evaluations_signal_method_product_horizon_uidx").on(table.signalId, table.methodVersion, table.product, table.horizon),
  index("signal_evaluations_method_status_idx").on(table.methodVersion, table.status),
]);

export const signalEvaluationRevisions = sqliteTable("signal_evaluation_revisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  signalId: text("signal_id").notNull(),
  legacySignalId: integer("legacy_signal_id"),
  methodVersion: text("method_version").notNull(),
  product: text("product", { enum: ["direction_forecast", "trade_setup"] }).notNull(),
  horizon: integer("horizon").notNull(),
  horizonUnit: text("horizon_unit").notNull(),
  revision: integer("revision").notNull(),
  predecessorRevisionId: integer("predecessor_revision_id"),
  evidenceHash: text("evidence_hash").notNull(),
  verdict: text("verdict").notNull(),
  status: text("status", { enum: ["resolved", "ambiguous", "unverified", "open"] }).notNull(),
  reason: text("reason").notNull(),
  evidenceJson: text("evidence_json").notNull(),
  costModelJson: text("cost_model_json").notNull(),
  grossReturnPct: real("gross_return_pct"),
  netReturnPct: real("net_return_pct"),
  grossR: real("gross_r"),
  netR: real("net_r"),
  evaluatedAt: integer("evaluated_at", { mode: "timestamp_ms" }).notNull(),
  maturesAt: integer("matures_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("signal_evaluation_revisions_evidence_uidx").on(table.signalId, table.methodVersion, table.product, table.horizon, table.evidenceHash),
  uniqueIndex("signal_evaluation_revisions_sequence_uidx").on(table.signalId, table.methodVersion, table.product, table.horizon, table.revision),
  index("signal_evaluation_revisions_current_idx").on(table.methodVersion, table.product, table.horizon, table.signalId, table.revision),
]);

export const strategyTrials = sqliteTable("strategy_trials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trialId: text("trial_id").notNull().unique(),
  strategyId: text("strategy_id").notNull(),
  strategyVersion: text("strategy_version").notNull(),
  parameterHash: text("parameter_hash").notNull(),
  buildId: text("build_id").notNull(),
  status: text("status", { enum: ["planned", "running", "failed", "completed", "retired"] }).notNull(),
  hypothesis: text("hypothesis").notNull(),
  specJson: text("spec_json").notNull(),
  resultJson: text("result_json"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const scanOperations = sqliteTable("scan_operations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scanKey: text("scan_key").notNull().unique(),
  strategyId: text("strategy_id").notNull(),
  strategyVersion: text("strategy_version").notNull(),
  status: text("status", { enum: ["complete", "degraded", "failed"] }).notNull(),
  requestedCount: integer("requested_count").notNull(),
  fetchedCount: integer("fetched_count").notNull(),
  eligibleCount: integer("eligible_count").notNull(),
  scoredCount: integer("scored_count").notNull(),
  watchedCount: integer("watched_count").notNull(),
  issuedCount: integer("issued_count").notNull(),
  suppressedCount: integer("suppressed_count").notNull(),
  reasonCountsJson: text("reason_counts_json").notNull(),
  lastAttemptAt: integer("last_attempt_at", { mode: "timestamp_ms" }).notNull(),
  lastSuccessAt: integer("last_success_at", { mode: "timestamp_ms" }),
  checkpointJson: text("checkpoint_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("scan_operations_strategy_time_idx").on(table.strategyId, table.lastAttemptAt),
]);


export const marketDataObservations = sqliteTable("market_data_observations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  observationKey: text("observation_key").notNull().unique(),
  instrument: text("instrument").notNull(),
  symbol: text("symbol").notNull(),
  market: text("market", { enum: ["crypto", "equity"] }).notNull(),
  source: text("source").notNull(),
  venue: text("venue").notNull(),
  pair: text("pair").notNull(),
  quoteCurrency: text("quote_currency").notNull(),
  kind: text("kind", { enum: ["quote", "candle", "volume_24h"] }).notNull(),
  interval: text("interval").notNull(),
  candleState: text("candle_state", { enum: ["point", "forming", "completed"] }).notNull(),
  eventAt: integer("event_at", { mode: "timestamp_ms" }).notNull(),
  intervalStartAt: integer("interval_start_at", { mode: "timestamp_ms" }),
  intervalEndAt: integer("interval_end_at", { mode: "timestamp_ms" }),
  providerUpdatedAt: integer("provider_updated_at", { mode: "timestamp_ms" }),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
  lastSuccessfulRefreshAt: integer("last_successful_refresh_at", { mode: "timestamp_ms" }).notNull(),
  value: real("value"),
  open: real("open"),
  high: real("high"),
  low: real("low"),
  close: real("close"),
  volume: real("volume"),
  providerVersion: integer("provider_version").notNull().default(1),
  correctionOfId: integer("correction_of_id"),
  rawTraceJson: text("raw_trace_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("market_data_observations_instrument_kind_time_idx").on(table.instrument, table.kind, table.eventAt),
]);

export const marketRefreshRuns = sqliteTable("market_refresh_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  refreshKey: text("refresh_key").notNull().unique(),
  path: text("path", { enum: ["market_data", "expensive_analysis", "signal_monitor"] }).notNull(),
  status: text("status", { enum: ["running", "complete", "degraded", "failed"] }).notNull(),
  requestedCount: integer("requested_count").notNull(),
  fetchedCount: integer("fetched_count").notNull(),
  savedCount: integer("saved_count").notNull(),
  dedupedCount: integer("deduped_count").notNull(),
  requestWeight: integer("request_weight").notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  rateLimitCount: integer("rate_limit_count").notNull().default(0),
  retryAfterMs: integer("retry_after_ms"),
  source: text("source").notNull(),
  error: text("error"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("market_refresh_runs_path_time_idx").on(table.path, table.startedAt),
]);

export const marketStreamHealth = sqliteTable("market_stream_health", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  streamKey: text("stream_key").notNull().unique(),
  instrument: text("instrument").notNull(),
  source: text("source").notNull(),
  quoteCurrency: text("quote_currency").notNull(),
  kind: text("kind", { enum: ["quote", "candle", "volume_24h"] }).notNull(),
  interval: text("interval").notNull(),
  candleState: text("candle_state", { enum: ["point", "forming", "completed"] }).notNull(),
  lastAttemptAt: integer("last_attempt_at", { mode: "timestamp_ms" }).notNull(),
  lastSuccessAt: integer("last_success_at", { mode: "timestamp_ms" }),
  lastObservationKey: text("last_observation_key"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("market_stream_health_instrument_kind_idx").on(table.instrument, table.kind),
]);

export const signalStatusEvents = sqliteTable("signal_status_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventKey: text("event_key").notNull().unique(),
  signalId: text("signal_id").notNull(),
  status: text("status", { enum: ["target_observed", "stop_observed", "stale", "entry_no_longer_eligible", "current_mark"] }).notNull(),
  observationKey: text("observation_key").notNull(),
  observedPrice: real("observed_price"),
  observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(),
  authoritativeSettlement: integer("authoritative_settlement", { mode: "boolean" }).notNull().default(false),
  detail: text("detail").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("signal_status_events_signal_time_idx").on(table.signalId, table.observedAt),
]);


export const measurementRuns = sqliteTable("measurement_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull().unique(),
  terminal: text("terminal").notNull(),
  cohort: text("cohort").notNull(),
  evaluatorVersion: text("evaluator_version").notNull(),
  sourceCommit: text("source_commit").notNull(),
  status: text("status", { enum: ["running", "partial", "complete", "failed"] }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  evaluationCutoffAt: integer("evaluation_cutoff_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  lastSuccessfulCompleteAt: integer("last_successful_complete_at", { mode: "timestamp_ms" }),
  leaseToken: text("lease_token"),
  leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
  checkpointVersion: integer("checkpoint_version").notNull().default(0),
  cursor: integer("cursor").notNull().default(0),
  batchSize: integer("batch_size").notNull(),
  signalsInScope: integer("signals_in_scope").notNull(),
  retrieved: integer("retrieved").notNull().default(0),
  eligibleDue: integer("eligible_due").notNull().default(0),
  evaluated: integer("evaluated").notNull().default(0),
  pending: integer("pending").notNull().default(0),
  ambiguous: integer("ambiguous").notNull().default(0),
  unverified: integer("unverified").notNull().default(0),
  excluded: integer("excluded").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  snapshotJson: text("snapshot_json").notNull(),
  definitionsJson: text("definitions_json").notNull(),
  failedIdsJson: text("failed_ids_json").notNull().default("[]"),
  retryPending: integer("retry_pending", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("measurement_runs_status_started_idx").on(table.status, table.startedAt),
]);

export const measurementRunItems = sqliteTable("measurement_run_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull(),
  signalId: text("signal_id").notNull(),
  legacySignalId: integer("legacy_signal_id"),
  membershipOrdinal: integer("membership_ordinal"),
  status: text("status", { enum: ["evaluated", "pending", "ambiguous", "unverified", "excluded", "failed"] }).notNull(),
  reason: text("reason").notNull(),
  tradeState: text("trade_state", { enum: ["open", "settled", "unknown"] }).notNull().default("unknown"),
  tradeStateReason: text("trade_state_reason").notNull().default("Trade state has not been evaluated."),
  sourcesJson: text("sources_json").notNull(),
  attemptCount: integer("attempt_count").notNull().default(1),
  evaluatedAt: integer("evaluated_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("measurement_run_items_run_signal_unique").on(table.runId, table.signalId),
  uniqueIndex("measurement_run_items_run_ordinal_unique").on(table.runId, table.membershipOrdinal),
  index("measurement_run_items_run_status_idx").on(table.runId, table.status),
]);

export const memeRiskValidations = sqliteTable("meme_risk_validations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mint: text("mint").notNull(),
  symbol: text("symbol"),
  claimsRenounced: integer("claims_renounced", { mode: "boolean" }).notNull().default(false),
  verdict: text("verdict", { enum: ["PASS", "CAUTION", "DISQUALIFIED", "UNVERIFIED"] }).notNull(),
  vetoReason: text("veto_reason"),
  rugcheckStatus: text("rugcheck_status", { enum: ["clean", "caution", "critical", "unverified"] }).notNull(),
  rugcheckScore: real("rugcheck_score"),
  bundleStatus: text("bundle_status", { enum: ["clean", "caution", "critical", "unverified"] }).notNull(),
  holderStatus: text("holder_status", { enum: ["clean", "caution", "critical", "unverified"] }).notNull(),
  holderCount: integer("holder_count"),
  topHolderSharePct: real("top_holder_share_pct"),
  snapshotJson: text("snapshot_json").notNull(),
  sourceAsOf: integer("source_as_of", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("meme_risk_validations_mint_time_idx").on(table.mint, table.createdAt),
]);


export const paperHandoffRuns = sqliteTable("paper_handoff_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  handoffKey: text("handoff_key").notNull().unique(),
  discoveryRunId: integer("discovery_run_id").notNull().unique(),
  status: text("status", { enum: ["building", "complete", "failed"] }).notNull(),
  discoveredCount: integer("discovered_count").notNull().default(0),
  scoredCount: integer("scored_count").notNull().default(0),
  directionalCount: integer("directional_count").notNull().default(0),
  eligibleCount: integer("eligible_count").notNull().default(0),
  rejectedCount: integer("rejected_count").notNull().default(0),
  reasonCountsJson: text("reason_counts_json").notNull(),
  sourceAccountingJson: text("source_accounting_json").notNull(),
  handlerVersion: text("handler_version").notNull(),
  sourceHashesJson: text("source_hashes_json").notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("paper_handoff_runs_handoff_key_uidx").on(table.handoffKey), uniqueIndex("paper_handoff_runs_discovery_run_uidx").on(table.discoveryRunId), index("paper_handoff_runs_status_completed_idx").on(table.status, table.completedAt)]);

export const paperHandoffCandidates = sqliteTable("paper_handoff_candidates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  handoffRunId: integer("handoff_run_id").notNull(),
  discoveryRunId: integer("discovery_run_id").notNull(),
  discoverySignalId: integer("discovery_signal_id"),
  candidateKey: text("candidate_key").notNull().unique(),
  coinId: text("coin_id").notNull(),
  symbol: text("symbol").notNull(),
  direction: text("direction", { enum: ["long", "short", "watch", "unknown"] }).notNull(),
  stage: text("stage").notNull(),
  outcome: text("outcome", { enum: ["eligible", "rejected", "failed"] }).notNull(),
  reasonCode: text("reason_code").notNull(),
  reason: text("reason").notNull(),
  preLegacyFilter: integer("pre_legacy_filter", { mode: "boolean" }).notNull().default(true),
  factorLedgerJson: text("factor_ledger_json").notNull(),
  decisionEvidenceJson: text("decision_evidence_json").notNull(),
  // Additive evidence capture (migration 0067): decision-time drift reference
  // captured during the discovery run, before the candidate's decisionAt was
  // stamped. JSON string or null. No production decision ever reads it.
  driftReferenceCaptureJson: text("drift_reference_capture_json"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("paper_handoff_candidates_candidate_key_uidx").on(table.candidateKey), index("paper_handoff_candidates_run_outcome_idx").on(table.handoffRunId, table.outcome)]);

export const paperCandidateIntake = sqliteTable("paper_candidate_intake", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  handoffCandidateId: integer("handoff_candidate_id").notNull(),
  handoffRunId: integer("handoff_run_id").notNull(),
  discoveryRunId: integer("discovery_run_id").notNull(),
  candidateKey: text("candidate_key").notNull(),
  batchOrdinal: integer("batch_ordinal").notNull(),
  status: text("status", { enum: ["queued", "processing", "processed", "retryable_failure", "overflow_deferred", "processing_expired", "missed_processing"] }).notNull(),
  outcome: text("outcome"),
  reasonCode: text("reason_code"),
  reason: text("reason"),
  decisionAt: integer("decision_at", { mode: "timestamp_ms" }).notNull(),
  entryExpiresAt: integer("entry_expires_at", { mode: "timestamp_ms" }).notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  claimedBy: text("claimed_by"),
  leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("paper_candidate_intake_handoff_candidate_uidx").on(table.handoffCandidateId),
  uniqueIndex("paper_candidate_intake_candidate_key_uidx").on(table.candidateKey),
  index("paper_candidate_intake_status_expiry_idx").on(table.status, table.entryExpiresAt),
  index("paper_candidate_intake_handoff_status_idx").on(table.handoffRunId, table.status),
]);

export const paperEntryCheckpoints = sqliteTable("paper_entry_checkpoints", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  candidateId: integer("candidate_id").notNull().unique(),
  contractState: text("contract_state", { enum: ["pending", "entered", "void_first_print_missed", "void_first_print_unverifiable", "void_expired", "void_invalidated"] }).notNull(),
  firstVenueTradeId: text("first_venue_trade_id"),
  firstVenueSeq: integer("first_venue_seq"),
  firstPrintObservedAt: integer("first_print_observed_at", { mode: "timestamp_ms" }),
  firstPrintPrice: real("first_print_price"),
  requestSinceAt: integer("request_since_at", { mode: "timestamp_ms" }).notNull(),
  requestUntilAt: integer("request_until_at", { mode: "timestamp_ms" }).notNull(),
  receiptAt: integer("receipt_at", { mode: "timestamp_ms" }),
  rawResponseHash: text("raw_response_hash"),
  coverageJson: text("coverage_json").notNull(),
  checkpointJson: text("checkpoint_json").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("paper_entry_checkpoints_candidate_uidx").on(table.candidateId), index("paper_entry_checkpoints_state_updated_idx").on(table.contractState, table.updatedAt)]);

export const paperSignalRuns = sqliteTable("paper_signal_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runKey: text("run_key").notNull().unique(),
  trigger: text("trigger", { enum: ["manual", "scheduled"] }).notNull(),
  status: text("status", { enum: ["running", "complete", "partial", "failed"] }).notNull(),
  freezeVersion: text("freeze_version").notNull(),
  freezeHash: text("freeze_hash").notNull(),
  discoveryRunId: integer("discovery_run_id"),
  candidateCount: integer("candidate_count").notNull().default(0),
  issuedCount: integer("issued_count").notNull().default(0),
  abstainedCount: integer("abstained_count").notNull().default(0),
  deferredCount: integer("deferred_count").notNull().default(0),
  summary: text("summary").notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("paper_signal_runs_run_key_uidx").on(table.runKey)]);

export const paperSignalCandidates = sqliteTable("paper_signal_candidates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  candidateKey: text("candidate_key").notNull().unique(),
  runId: integer("run_id").notNull(),
  discoverySignalId: integer("discovery_signal_id").notNull(),
  discoveryRunId: integer("discovery_run_id").notNull(),
  coinId: text("coin_id").notNull(), name: text("name").notNull(), symbol: text("symbol").notNull(),
  venue: text("venue").notNull(), instrument: text("instrument").notNull(),
  direction: text("direction", { enum: ["long", "short"] }).notNull(),
  state: text("state", { enum: ["awaiting_entry", "issued", "expired", "invalidated", "deferred", "abstained"] }).notNull(),
  reasonCode: text("reason_code"), reason: text("reason"),
  decisionAt: integer("decision_at", { mode: "timestamp_ms" }).notNull(),
  sourceObservedAt: integer("source_observed_at", { mode: "timestamp_ms" }),
  entryObservedAt: integer("entry_observed_at", { mode: "timestamp_ms" }),
  entryReceivedAt: integer("entry_received_at", { mode: "timestamp_ms" }),
  entryExpiresAt: integer("entry_expires_at", { mode: "timestamp_ms" }).notNull(),
  entryPrice: real("entry_price"), stopPrice: real("stop_price").notNull(), targetPrice: real("target_price"),
  decisionReferencePrice: real("decision_reference_price"),
  // Additive evidence capture (migration 0067): copied verbatim from the
  // handoff candidate's discovery-time drift reference capture. JSON string
  // or null. Never read by any drift test, gate, or issuance decision.
  driftReferenceCaptureJson: text("drift_reference_capture_json"),
  permittedDriftBps: real("permitted_drift_bps").notNull(),
  productionScore: real("production_score"), challengerScore: real("challenger_score"),
  factorLedgerJson: text("factor_ledger_json").notNull(), operationalEvidenceJson: text("operational_evidence_json").notNull(),
  freezeVersion: text("freeze_version").notNull(), productionHash: text("production_hash").notNull(), challengerHash: text("challenger_hash").notNull(),
  invocationClaim: text("invocation_claim").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("paper_signal_candidates_candidate_key_uidx").on(table.candidateKey), index("paper_signal_candidates_state_updated_idx").on(table.state, table.updatedAt)]);

export const paperSignals = sqliteTable("paper_signals", {
  id: integer("id").primaryKey({ autoIncrement: true }), paperSignalId: text("paper_signal_id").notNull().unique(), candidateId: integer("candidate_id").notNull().unique(),
  coinId: text("coin_id").notNull(), symbol: text("symbol").notNull(), venue: text("venue").notNull(), instrument: text("instrument").notNull(), direction: text("direction", { enum: ["long", "short"] }).notNull(),
  entryPrice: real("entry_price").notNull(), stopPrice: real("stop_price").notNull(), targetPrice: real("target_price").notNull(),
  decisionAt: integer("decision_at", { mode: "timestamp_ms" }).notNull(), entryAt: integer("entry_at", { mode: "timestamp_ms" }).notNull(), issuedAt: integer("issued_at", { mode: "timestamp_ms" }).notNull(), expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  contractVersion: text("contract_version").notNull(), evaluatorVersion: text("evaluator_version").notNull(), evidenceJson: text("evidence_json").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("paper_signals_signal_id_uidx").on(table.paperSignalId), uniqueIndex("paper_signals_candidate_id_uidx").on(table.candidateId)]);

export const paperAlertEvents = sqliteTable("paper_alert_events", {
  id: integer("id").primaryKey({ autoIncrement: true }), eventKey: text("event_key").notNull().unique(), paperSignalId: text("paper_signal_id").notNull(),
  contractId: text("contract_id"), eventType: text("event_type"), eventVersion: integer("event_version"),
  status: text("status", { enum: ["enqueued", "delivered", "simulated_ack", "failed", "unconfigured"] }).notNull(), transport: text("transport").notNull(), destinationLabel: text("destination_label"), payloadJson: text("payload_json").notNull(),
  enqueuedAt: integer("enqueued_at", { mode: "timestamp_ms" }).notNull(), acknowledgedAt: integer("acknowledged_at", { mode: "timestamp_ms" }), attemptCount: integer("attempt_count").notNull().default(0), lastError: text("last_error"),
  // Terminal-first delivery (migration 0064): readAt is set ONLY by the
  // user's ack in the terminal UI (ackPaperAlert) — never by any job.
  // chatSentAt is stamped only by the digest job after a successful chat
  // send. expiresAt is copied from the candidate's frozen entryExpiresAt
  // at commit, never computed as issuedAt + window.
  readAt: integer("read_at", { mode: "timestamp_ms" }), chatSentAt: integer("chat_sent_at", { mode: "timestamp_ms" }), expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("paper_alert_events_event_key_uidx").on(table.eventKey), uniqueIndex("paper_alert_events_contract_type_version_uidx").on(table.contractId, table.eventType, table.eventVersion), index("paper_alert_events_status_updated_idx").on(table.status, table.updatedAt)]);

export const paperPollLeases = sqliteTable("paper_poll_leases", {
  lane: text("lane", { enum: ["entry_watch", "issuance_cycle", "delivery_worker"] }).primaryKey(),
  ownerToken: text("owner_token"),
  generation: integer("generation").notNull().default(0),
  leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
  rerunRequested: integer("rerun_requested", { mode: "boolean" }).notNull().default(false),
  coalescedCount: integer("coalesced_count").notNull().default(0),
  lastStartedAt: integer("last_started_at", { mode: "timestamp_ms" }),
  lastCompletedAt: integer("last_completed_at", { mode: "timestamp_ms" }),
  lastResultJson: text("last_result_json"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("paper_poll_leases_expiry_idx").on(table.leaseExpiresAt)]);

export const paperEntryWatchRuns = sqliteTable("paper_entry_watch_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runKey: text("run_key").notNull().unique(),
  status: text("status", { enum: ["running", "complete", "partial", "failed"] }).notNull(),
  examinedCount: integer("examined_count").notNull().default(0),
  issuedCount: integer("issued_count").notNull().default(0),
  pendingCount: integer("pending_count").notNull().default(0),
  terminalCount: integer("terminal_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  summary: text("summary").notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("paper_entry_watch_runs_run_key_uidx").on(table.runKey), index("paper_entry_watch_runs_started_at_idx").on(table.startedAt)]);

export const paperModelComparisons = sqliteTable("paper_model_comparisons", {
  id: integer("id").primaryKey({ autoIncrement: true }), rowKey: text("row_key").notNull().unique(), candidateId: integer("candidate_id").notNull(), cohort: text("cohort", { enum: ["prospective_issued", "prospective_suppressed", "retrospective_suppressed", "plumbing_test"] }).notNull(), eligibility: text("eligibility", { enum: ["eligible", "ineligible", "unknown"] }).notNull(),
  productionDecision: text("production_decision", { enum: ["long", "short", "abstain", "unknown"] }).notNull(), challengerDecision: text("challenger_decision", { enum: ["long", "short", "abstain", "unknown"] }).notNull(), productionScore: real("production_score"), challengerScore: real("challenger_score"),
  decisionAt: integer("decision_at", { mode: "timestamp_ms" }).notNull(), inputVerified: integer("input_verified", { mode: "boolean" }).notNull().default(false), unknownReason: text("unknown_reason"), outcomeStatus: text("outcome_status", { enum: ["pending", "complete", "missing"] }).notNull().default("pending"), outcomeJson: text("outcome_json"), freezeVersion: text("freeze_version").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("paper_model_comparisons_row_key_uidx").on(table.rowKey), index("paper_model_comparisons_cohort_created_idx").on(table.cohort, table.createdAt)]);


// Issuance kill-gate control plane. NORMAL is represented by no state row.
export const issuanceBandStates = sqliteTable("issuance_band_states", {
  band: text("band").primaryKey(),
  state: text("state", { enum: ["WARNING", "ISSUANCE_DISABLED"] }).notNull(),
  reason: text("reason").notNull(), expectancyR: real("expectancy_r"), sampleSize: integer("sample_size"),
  setBy: text("set_by").notNull(), setAt: text("set_at").notNull(), updatedAt: text("updated_at").notNull(),
});
export const issuanceBandRevisions = sqliteTable("issuance_band_revisions", {
  band: text("band").primaryKey(), revision: integer("revision").notNull().default(0),
});
export const issuanceBandStateHistory = sqliteTable("issuance_band_state_history", {
  id: integer("id").primaryKey({ autoIncrement: true }), band: text("band").notNull(), fromState: text("from_state"),
  toState: text("to_state", { enum: ["NORMAL", "WARNING", "ISSUANCE_DISABLED"] }).notNull(), reason: text("reason").notNull(),
  expectancyR: real("expectancy_r"), sampleSize: integer("sample_size"), setBy: text("set_by").notNull(), setAt: text("set_at").notNull(),
}, (table) => [index("idx_band_state_history_band").on(table.band, table.id)]);
export const issuanceGateAudits = sqliteTable("issuance_gate_audits", {
  id: text("id").primaryKey(), createdAt: text("created_at").notNull(), path: text("path", { enum: ["manual", "dossier", "scheduled"] }).notNull(),
  score: real("score").notNull(), band: text("band").notNull(), bandState: text("band_state", { enum: ["NORMAL", "WARNING", "ISSUANCE_DISABLED"] }).notNull(),
  decision: text("decision", { enum: ["allowed", "blocked", "warning_allowed"] }).notNull(), reason: text("reason").notNull(),
  isTest: integer("is_test", { mode: "boolean" }).notNull().default(false), signalIdentity: text("signal_identity"),
}, (table) => [index("idx_gate_audits_band").on(table.band, table.createdAt), index("idx_gate_audits_decision").on(table.decision, table.createdAt)]);

// Shared, source-linked context used by both dossier research and alerts.
export const assetProfiles = sqliteTable("asset_profiles", {
  assetId: text("asset_id").primaryKey(), symbol: text("symbol").notNull(), name: text("name").notNull(),
  assetKind: text("asset_kind", { enum: ["crypto", "equity"] }).notNull(),
  description: text("description").notNull(), economicModel: text("economic_model").notNull(), instrument: text("instrument").notNull(),
  sourceUrl: text("source_url").notNull(), verifiedAt: integer("verified_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("asset_profiles_symbol_uidx").on(table.symbol)]);

export const assetContextLinks = sqliteTable("asset_context_links", {
  id: integer("id").primaryKey({ autoIncrement: true }), assetId: text("asset_id").notNull(),
  sourceType: text("source_type", { enum: ["theory_watch", "discovery_news", "signal_contract", "paper_alert", "linked_research"] }).notNull(),
  sourceId: text("source_id").notNull(), stance: text("stance", { enum: ["supporting", "challenging", "neutral"] }).notNull(),
  eventAt: integer("event_at", { mode: "timestamp_ms" }).notNull(), linkedAt: integer("linked_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("asset_context_links_source_uidx").on(table.assetId, table.sourceType, table.sourceId), index("asset_context_links_asset_event_idx").on(table.assetId, table.eventAt)]);

export const assetResearchRecords = sqliteTable("asset_research_records", {
  id: integer("id").primaryKey({ autoIncrement: true }), canonicalKey: text("canonical_key").notNull().unique(),
  originKind: text("origin_kind", { enum: ["morning_edition", "x_sweep", "caller_capture", "other"] }).notNull(),
  title: text("title").notNull(), body: text("body").notNull(), sourceUrl: text("source_url"), sourcePublisher: text("source_publisher").notNull(),
  evidenceClass: text("evidence_class", { enum: ["verified", "unverified", "opinion"] }).notNull(),
  observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(), capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull(),
  sourceHash: text("source_hash").notNull(),
}, (table) => [uniqueIndex("asset_research_records_canonical_uidx").on(table.canonicalKey), index("asset_research_records_observed_idx").on(table.observedAt)]);

export const assetAssessments = sqliteTable("asset_assessments", {
  id: integer("id").primaryKey({ autoIncrement: true }), assessmentKey: text("assessment_key").notNull().unique(),
  assetId: text("asset_id").notNull(), symbol: text("symbol").notNull(), flow: text("flow").notNull(),
  explanationJson: text("explanation_json").notNull(), evidenceJson: text("evidence_json").notNull(), contextSnapshotJson: text("context_snapshot_json").notNull(),
  researchVersion: text("research_version").notNull(), decisionAt: integer("decision_at", { mode: "timestamp_ms" }).notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("asset_assessments_asset_decision_idx").on(table.assetId, table.decisionAt)]);

export const assetAssessmentOutcomes = sqliteTable("asset_assessment_outcomes", {
  id: integer("id").primaryKey({ autoIncrement: true }), assessmentId: integer("assessment_id").notNull(),
  outcomeType: text("outcome_type", { enum: ["observation", "settlement", "correction"] }).notNull(), outcomeJson: text("outcome_json").notNull(), evidenceJson: text("evidence_json").notNull(),
  observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("asset_assessment_outcomes_assessment_time_idx").on(table.assessmentId, table.observedAt)]);

export const assetResearchContextReads = sqliteTable("asset_research_context_reads", {
  id: integer("id").primaryKey({ autoIncrement: true }), assetId: text("asset_id").notNull(), flow: text("flow").notNull(), contextHash: text("context_hash").notNull(),
  theoryCount: integer("theory_count").notNull(), newsCount: integer("news_count").notNull(), retrievedAt: integer("retrieved_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("asset_research_context_reads_asset_time_idx").on(table.assetId, table.retrievedAt)]);

export const assetLearningProposals = sqliteTable("asset_learning_proposals", {
  id: integer("id").primaryKey({ autoIncrement: true }), assetId: text("asset_id"), question: text("question").notNull(), finding: text("finding").notNull(),
  proposedTest: text("proposed_test").notNull(), status: text("status", { enum: ["proposed", "testing", "rejected", "accepted"] }).notNull().default("proposed"),
  modelChangeApplied: integer("model_change_applied", { mode: "boolean" }).notNull().default(false), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

// Discovery funnel counts (Batch 2, 2026-10-20): APPEND-ONLY measurement
// counters written once at run completion, after every decision for the run
// is final. They observe the decisions the pipeline already made; no gate,
// threshold, weight, tier, door, scoring, or issuance decision ever reads
// this table. Migration 0058.
export const discoveryFunnelCounts = sqliteTable("discovery_funnel_counts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull(),
  runKind: text("run_kind", { enum: ["discovery", "issuance"] }).notNull(),
  stage: text("stage").notNull(),
  gate: text("gate"),
  reasonCode: text("reason_code").notNull(),
  count: integer("count").notNull(),
  computedAt: integer("computed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("discovery_funnel_counts_run_idx").on(table.runKind, table.runId),
  index("discovery_funnel_counts_computed_idx").on(table.computedAt),
]);

// Per-asset ATH gate records (migration 0067): APPEND-ONLY evidence capture
// written during runMarketDiscovery at the moment the run evaluates each
// catalog asset against the >=75%-below-ATH rule together with its +15%/48H
// velocity bypass. One row per asset per discovery run. No gate, threshold,
// scoring, veto, or issuance decision ever reads this table; it exists so
// assets excluded by the ATH gate remain individually visible instead of
// surviving only as the aggregate ath_hard_gate funnel count. Rows are never
// backfilled for runs before this change.
export const discoveryAthGateRecords = sqliteTable("discovery_ath_gate_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  discoveryRunId: integer("discovery_run_id").notNull(),
  coinId: text("coin_id").notNull(),
  symbol: text("symbol").notNull(),
  evaluatedAt: integer("evaluated_at", { mode: "timestamp_ms" }).notNull(),
  athDistancePct: real("ath_distance_pct"),
  athValue: real("ath_value"),
  athDate: text("ath_date"),
  athRuleFired: integer("ath_rule_fired", { mode: "boolean" }).notNull(),
  velocityBypassApplied: integer("velocity_bypass_applied", { mode: "boolean" }).notNull(),
  disposition: text("disposition", { enum: ["excluded_by_ath_gate", "bypassed_velocity", "passed"] }).notNull(),
}, (table) => [
  index("discovery_ath_gate_records_run_idx").on(table.discoveryRunId),
  index("discovery_ath_gate_records_coin_idx").on(table.coinId, table.evaluatedAt),
]);

// DeFiLlama gecko_id crosswalk (Batch 4, 2026-10-20): CoinGecko coinId →
// DeFiLlama protocol slug, built weekly inside refreshFundamentalsScores from
// the DeFiLlama /protocols bulk list. Coverage only: it resolves TVL and fee
// slugs for assets with no curated mapping. It changes no score formula,
// weight, gate, or threshold. Rows with source 'curated' are never
// overwritten by the automated gecko_id pass. verifiedAt is set only after a
// lazy DeFiLlama fee-summary call confirms the slug returns fee data; an
// unverified slug is never scored. Migration 0059.
// Catalog snapshots (Batch 5 Part A, 2026-10-20): the last good CoinGecko
// ranked catalog (both pages, deduped) persisted by loadUniverseCatalog so a
// 429 burst degrades to a labeled cached read (<= 24h old) instead of killing
// the run; older than 24h the run is honestly MISSED. Fallback only — a fresh
// upstream answer is always the primary read. Migration 0060.
export const catalogSnapshots = sqliteTable("catalog_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  rowCount: integer("row_count").notNull(),
  catalogVersion: text("catalog_version").notNull(),
  rowsJson: text("rows_json").notNull(),
  sourceStatus: text("source_status"),
});

export const defillamaCrosswalk = sqliteTable("defillama_crosswalk", {
  coinId: text("coin_id").primaryKey(),
  symbol: text("symbol"),
  slug: text("slug"),
  source: text("source", { enum: ["curated", "gecko_id"] }).notNull(),
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
  notes: text("notes"),
});

// Research shortlist read model (research-shortlist-v0.1): append-only
// snapshots of the separately-versioned research ranking computed by
// getResearchShortlist. Read-model only — it shares no code path with
// issuance, cannot issue, cannot gate, and never feeds the frozen model.
export const researchShortlistSnapshots = sqliteTable("research_shortlist_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  version: text("version").notNull(),
  computedAt: integer("computed_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  payloadJson: text("payload_json").notNull(),
});

// Bounded issuance-work checks (migration 0066): APPEND-ONLY ledger, one row
// per bounded work check the issuance cycle performs against the latest
// completed handoff. The decision is computed from committed processing state
// only (latest committed paper_signal_runs row for the handoff + the durable
// paper_candidate_intake dispositions) — never from a scheduler receipt or
// any "last triggered" timestamp. This ledger is the measurement surface
// that keeps the three volumes separate: scheduled checks (rows here),
// worker launches/coalescing (paper_poll_leases), and full issuance
// executions (paper_signal_runs rows). No issuance decision reads this table;
// it records decisions after they are made.
export const paperIssuanceWorkChecks = sqliteTable("paper_issuance_work_checks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  handoffRunId: integer("handoff_run_id"),
  discoveryRunId: integer("discovery_run_id"),
  trigger: text("trigger", { enum: ["manual", "scheduled"] }).notNull(),
  // "coalesced" (2026-10-21 check-before-coalesce repair): an issuance poll
  // tick that found the issuance_cycle lease held by another generation
  // still records its attempted check with decision "coalesced" and
  // resultStatus "coalesced" instead of recording nothing. The underlying
  // column is plain text (no SQL CHECK constraint), so this enum widening
  // needs no DDL migration; historical rows are untouched.
  // "monitoring_hold" (2026-10-23 issuance inspection): a cycle refused by
  // the monitoring-health gate records decision "monitoring_hold" with
  // resultStatus "held" and the gate's full explanation, instead of the
  // hold branch returning without recording anything — the gap that made
  // a designed hold (coverage stale past its 45-minute bound) read as a
  // dispatch failure. Same plain-text column, no DDL migration.
  // "coverage_gap_closed" (2026-10-25 missed-handoff repair): the
  // append-only disposition row recorded when an expired, never-selected
  // handoff is closed as missed_processing by
  // closeMissedHandoffCoverageGap. Same plain-text column, no DDL
  // migration; historical rows are untouched.
  decision: text("decision", { enum: ["skipped_completed", "processed_new", "recovered_incomplete", "no_handoff", "coalesced", "monitoring_hold", "coverage_gap_closed"] }).notNull(),
  resultStatus: text("result_status").notNull(),
  priorRunId: integer("prior_run_id"),
  priorRunStatus: text("prior_run_status"),
  intakeTotal: integer("intake_total").notNull().default(0),
  intakeTerminal: integer("intake_terminal").notNull().default(0),
  intakePending: integer("intake_pending").notNull().default(0),
  resultingRunId: integer("resulting_run_id"),
  reason: text("reason").notNull(),
  checkedAt: integer("checked_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("paper_issuance_work_checks_checked_idx").on(table.checkedAt),
  index("paper_issuance_work_checks_handoff_idx").on(table.handoffRunId, table.checkedAt),
]);

// Write-failure captures (migration 0068; Q6 hardening 0069): the original
// driver error + cause chain for failed writes, captured after retries
// exhaust — one row per occurrence. Stored text is bounded at the capture
// layer (8,000 chars with a truncation marker) and secrets-redacted — it
// never goes through compactError's 220-char slice (that cap is why
// verbatim text was missing from receipts, discovery/theory summaries, and
// intake reasons). Operation + schema version are recorded per capture
// (0069). Fix-neutral: no decision path reads this table.
// Q2 expanded-scoring harness runs (migration 0070): HARNESS-ONLY report
// rows for the pre-activation expanded scoring measurement. No production
// decision, gate, threshold, or issuance path ever reads this table; the
// harness itself writes ONLY here, and its writes-disabled proof counts
// the production tables (paper_signal_runs, paper_candidate_intake,
// notification tables, monitoring enrollment tables) before vs after.
export const expandedScoringHarnessRuns = sqliteTable("expanded_scoring_harness_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runKey: text("run_key").notNull().unique(),
  status: text("status", { enum: ["complete", "failed"] }).notNull(),
  requestedCount: integer("requested_count").notNull().default(0),
  presentCount: integer("present_count").notNull().default(0),
  evaluatedCount: integer("evaluated_count").notNull().default(0),
  notEvaluatedCount: integer("not_evaluated_count").notNull().default(0),
  scoringMs: integer("scoring_ms").notNull().default(0),
  velocityMs: integer("velocity_ms").notNull().default(0),
  evidenceLoadMs: integer("evidence_load_ms").notNull().default(0),
  overBudget: integer("over_budget", { mode: "boolean" }).notNull().default(false),
  duplicateScoringDetected: integer("duplicate_scoring_detected", { mode: "boolean" }).notNull().default(false),
  guardAttempts: integer("guard_attempts").notNull().default(0),
  writesProofJson: text("writes_proof_json").notNull(),
  reportJson: text("report_json").notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("expanded_scoring_harness_runs_run_key_uidx").on(table.runKey),
  index("expanded_scoring_harness_runs_created_idx").on(table.createdAt),
]);

export const writeFailureCaptures = sqliteTable("write_failure_captures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
  lane: text("lane").notNull(),
  tableName: text("table_name").notNull(),
  statementKind: text("statement_kind").notNull(),
  operation: text("operation").notNull().default("unknown"),
  schemaVersion: text("schema_version").notNull().default("0068"),
  runId: text("run_id"),
  attemptedKey: text("attempted_key"),
  errorText: text("error_text").notNull(),
  errorKind: text("error_kind").notNull(),
  contextJson: text("context_json"),
}, (table) => [
  index("write_failure_captures_lane_occurred_idx").on(table.lane, table.occurredAt),
]);
