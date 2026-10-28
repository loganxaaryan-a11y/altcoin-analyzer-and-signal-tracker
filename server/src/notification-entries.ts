// ── Single-entry notification view (2026-10-28) ─────────────────────────
//
// The notification stores keep one ROW per lifecycle event — a single
// prediction (one discovery run + one candidate) could surface as an
// AWAITING_ISSUANCE row, a SETUP_PENDING row, an ENTRY_CONFIRMED row and
// an expired row: the "999 things" pile, where the count was rows, not
// predictions. The stored rows are NEVER rewritten by this module. It is
// a pure read-time projection: rows that belong to the same prediction
// collapse into ONE entry whose current fields come from the latest row,
// and whose statusHistory is the append-only, timestamped list of every
// stored row's event — oldest first, exactly as recorded. The same
// symbol in a different discovery run is a different prediction and
// stays a separate entry, because the run id is part of the key.
//
// (store, id) keying is preserved everywhere: every history entry keeps
// its own store + id, and the ack actions keep addressing single stored
// rows. Collapsing changes presentation and counts only.

export interface NotificationHistorySource {
  store: "paper_alert" | "discovery" | "engine_hit";
  id: number;
  // paper_alert: the alert eventKey (`<candidateKey>:setup-pending` or
  // `<candidateKey>:<EVENT_TYPE>:v<n>`); discovery: `discovery:<id>`;
  // engine_hit: `engine_hit:<id>`.
  dedupKey: string;
  coinId: string | null;
  // discovery rows: `discovery_run:<runId>`; other stores: their own ref.
  sourceRef: string;
  eventType: string;
  eventAt: string;
  storedAt: string;
  group: "actionable" | "lifecycle" | "expired";
  read: boolean;
  readAt: string | null;
}

export interface NotificationStatusHistoryEntry {
  store: NotificationHistorySource["store"];
  id: number;
  eventType: string;
  // When the event happened (from the record, never wall clock at read).
  at: string;
  // When this status was committed to the store.
  storedAt: string;
  group: NotificationHistorySource["group"];
  read: boolean;
}

// The paper candidate key embedded in an alert eventKey: the event
// suffix (`:setup-pending`, `:<EVENT_TYPE>:v<n>`, or a bare `:<EVENT>`)
// is stripped. Candidate keys themselves contain colons but never an
// all-caps event segment, so the strip is anchored to those shapes.
export function candidateKeyFromPaperEventKey(eventKey: string): string {
  return eventKey
    .replace(/:setup-pending$/, "")
    .replace(/:[A-Z][A-Z_]*:v\d+$/, "")
    .replace(/:[A-Z][A-Z_]*$/, "");
}

// The single-entry key for one prediction. Handoff candidate keys encode
// the pair directly (`<freeze>:handoff:<discoveryRunId>:<coinId>`), and
// discovery rows carry the same pair as (sourceRef run, coinId) — so a
// paper lifecycle row and a discovery row for the same run+candidate
// resolve to the SAME key and merge into one entry.
export function predictionEntryKey(row: NotificationHistorySource): string {
  if (row.store === "discovery") {
    const runMatch = row.sourceRef.match(/^discovery_run:(\d+)$/);
    if (runMatch && row.coinId) return `prediction:${runMatch[1]}:${row.coinId}`;
    return `prediction:discovery-row:${row.id}`;
  }
  if (row.store === "paper_alert") {
    const candidateKey = candidateKeyFromPaperEventKey(row.dedupKey);
    const handoffMatch = candidateKey.match(/:handoff:(\d+):(.+)$/);
    if (handoffMatch) return `prediction:${handoffMatch[1]}:${handoffMatch[2]}`;
    if (candidateKey && candidateKey !== row.dedupKey) return `prediction:candidate:${candidateKey}`;
    return `prediction:paper-row:${row.id}`;
  }
  // Engine hits are not predictions; each keeps its own entry.
  return `entry:engine-hit:${row.id}`;
}

export type CollapsedNotificationEntry<T extends NotificationHistorySource> = T & {
  entryKey: string;
  statusHistory: NotificationStatusHistoryEntry[];
  // How many stored rows this one entry presents (== statusHistory length).
  updateCount: number;
  firstStoredAt: string;
  lastStoredAt: string;
};

// Collapse rows into one entry per prediction. The representative row is
// the LATEST stored row (storedAt, then id): its fields are the entry's
// current fields. Read state is honest across the merge: the entry is
// read only when every stored row inside it is read, and readAt is the
// latest ack among them. Input rows are never mutated; history entries
// are new objects sorted oldest-first (append-only order).
export function collapseNotificationEntries<T extends NotificationHistorySource>(rows: readonly T[]): Array<CollapsedNotificationEntry<T>> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = predictionEntryKey(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  const collapsed: Array<CollapsedNotificationEntry<T>> = [];
  for (const [entryKey, group] of groups) {
    const byStored = [...group].sort((a, b) => Date.parse(a.storedAt) - Date.parse(b.storedAt) || a.id - b.id);
    const latest = byStored[byStored.length - 1];
    if (!latest) continue;
    const allRead = byStored.every((row) => row.read);
    const latestReadAt = byStored.reduce<string | null>((max, row) => (row.readAt && (max === null || row.readAt > max) ? row.readAt : max), null);
    collapsed.push({
      ...latest,
      entryKey,
      statusHistory: byStored.map((row) => ({
        store: row.store,
        id: row.id,
        eventType: row.eventType,
        at: row.eventAt,
        storedAt: row.storedAt,
        group: row.group,
        read: row.read,
      })),
      updateCount: byStored.length,
      firstStoredAt: byStored[0]?.storedAt ?? latest.storedAt,
      lastStoredAt: latest.storedAt,
      read: allRead,
      readAt: allRead ? latestReadAt : null,
    });
  }
  // Newest entry first, matching the pre-collapse newest-first ordering.
  collapsed.sort((a, b) => Date.parse(b.lastStoredAt) - Date.parse(a.lastStoredAt) || b.id - a.id);
  return collapsed;
}
