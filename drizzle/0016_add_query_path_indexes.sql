CREATE INDEX IF NOT EXISTS generated_signals_coin_id_idx ON generated_signals(coin_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS discovery_signals_run_id_idx ON discovery_signals(run_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS discovery_news_run_id_idx ON discovery_news(run_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS theory_watch_linked_symbol_idx ON theory_watch(linked_symbol);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS alert_hits_alert_id_idx ON alert_hits(alert_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS theory_predictions_theory_id_idx ON theory_predictions(theory_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS theory_evidence_theory_id_idx ON theory_evidence(theory_id);
