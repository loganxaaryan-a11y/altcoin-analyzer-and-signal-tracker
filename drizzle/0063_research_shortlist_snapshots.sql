CREATE TABLE research_shortlist_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL,
  computed_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);
