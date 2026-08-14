CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  badge TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'supervisor', 'analyst', 'field', 'readonly')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
  biometric_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login TEXT,
  credentials_updated_at TEXT,
  disabled_at TEXT,
  disabled_by TEXT,
  disabled_reason TEXT
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  reference_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  case_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  lead_officer_id TEXT,
  classification TEXT NOT NULL DEFAULT 'OFFICIAL',
  description TEXT,
  date_opened TEXT NOT NULL,
  date_closed TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(lead_officer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL,
  occurred_at TEXT,
  attributes TEXT,
  review_status TEXT NOT NULL DEFAULT 'not_required' CHECK(review_status IN ('not_required', 'pending', 'approved', 'returned')),
  submitted_by TEXT,
  submitted_at TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_notes TEXT,
  FOREIGN KEY(case_id) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(case_id) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS trusted_peers (
  peer_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending', 'verified', 'revoked')),
  invitation_expires_at TEXT NOT NULL,
  paired_at TEXT NOT NULL,
  verified_at TEXT,
  last_seen_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS evidence_provenance (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  node_id TEXT NOT NULL UNIQUE,
  exhibit_number TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  acquired_by TEXT NOT NULL,
  handling_status TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  chain_of_custody TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  attachment_name TEXT,
  attachment_uri TEXT,
  attachment_mime_type TEXT,
  attachment_digest TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY(case_id) REFERENCES cases(id),
  FOREIGN KEY(node_id) REFERENCES nodes(id)
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  content TEXT NOT NULL,
  linked_nodes TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(case_id) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  details TEXT,
  previous_hash TEXT,
  entry_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_users_status_badge ON users(status, badge);
CREATE INDEX IF NOT EXISTS idx_nodes_case_id ON nodes(case_id);
CREATE INDEX IF NOT EXISTS idx_nodes_case_occurred_at ON nodes(case_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_nodes_review_queue ON nodes(review_status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_edges_case_id ON edges(case_id);
CREATE INDEX IF NOT EXISTS idx_trusted_peers_status ON trusted_peers(status);
CREATE INDEX IF NOT EXISTS idx_evidence_provenance_case_id ON evidence_provenance(case_id);
CREATE INDEX IF NOT EXISTS idx_evidence_provenance_status ON evidence_provenance(verification_status, handling_status);
