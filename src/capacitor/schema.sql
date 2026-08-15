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

CREATE TABLE IF NOT EXISTS storage_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS case_assignments (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'removed')),
  assignment_note TEXT,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_by TEXT,
  removed_at TEXT,
  removal_reason TEXT,
  UNIQUE(case_id, operator_id),
  FOREIGN KEY(case_id) REFERENCES cases(id),
  FOREIGN KEY(operator_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS data_markings (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  object_type TEXT NOT NULL CHECK(object_type IN ('case', 'node', 'note', 'evidence')),
  object_id TEXT NOT NULL,
  marking TEXT NOT NULL,
  handling_instructions TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(case_id, object_type, object_id, marking),
  FOREIGN KEY(case_id) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS forensic_dossiers (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  manifest_digest TEXT NOT NULL,
  signature TEXT,
  signer_fingerprint TEXT,
  audit_chain_valid INTEGER NOT NULL,
  audit_head_hash TEXT,
  classification TEXT NOT NULL,
  redaction_profile TEXT NOT NULL,
  exported_by TEXT NOT NULL,
  exported_at TEXT NOT NULL,
  purpose TEXT NOT NULL,
  recipient_description TEXT NOT NULL,
  authorization_reference TEXT,
  verification_status TEXT NOT NULL CHECK(verification_status IN ('verified', 'unsigned', 'failed')),
  FOREIGN KEY(case_id) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS disclosure_register (
  id TEXT PRIMARY KEY,
  dossier_id TEXT NOT NULL UNIQUE,
  case_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  recipient_description TEXT NOT NULL,
  authorization_reference TEXT,
  disclosed_by TEXT NOT NULL,
  disclosed_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('prepared', 'shared', 'cancelled')),
  FOREIGN KEY(dossier_id) REFERENCES forensic_dossiers(id),
  FOREIGN KEY(case_id) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS field_tasks (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  assignee_id TEXT NOT NULL,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  checklist TEXT NOT NULL,
  context_note TEXT,
  due_at TEXT,
  status TEXT NOT NULL CHECK(status IN ('assigned', 'complete', 'unable')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_by TEXT,
  completed_at TEXT,
  completion_note TEXT,
  inability_reason TEXT,
  FOREIGN KEY(case_id) REFERENCES cases(id),
  FOREIGN KEY(assignee_id) REFERENCES users(id)
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
CREATE INDEX IF NOT EXISTS idx_case_assignments_operator_status ON case_assignments(operator_id, status, assigned_at);
CREATE INDEX IF NOT EXISTS idx_case_assignments_case_status ON case_assignments(case_id, status);
CREATE INDEX IF NOT EXISTS idx_data_markings_case_object ON data_markings(case_id, object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_forensic_dossiers_case_exported ON forensic_dossiers(case_id, exported_at);
CREATE INDEX IF NOT EXISTS idx_disclosure_register_case_disclosed ON disclosure_register(case_id, disclosed_at);
CREATE INDEX IF NOT EXISTS idx_field_tasks_assignee_status ON field_tasks(assignee_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_field_tasks_case_status ON field_tasks(case_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_nodes_case_id ON nodes(case_id);
CREATE INDEX IF NOT EXISTS idx_nodes_case_occurred_at ON nodes(case_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_nodes_review_queue ON nodes(review_status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_edges_case_id ON edges(case_id);
CREATE INDEX IF NOT EXISTS idx_trusted_peers_status ON trusted_peers(status);
CREATE INDEX IF NOT EXISTS idx_evidence_provenance_case_id ON evidence_provenance(case_id);
CREATE INDEX IF NOT EXISTS idx_evidence_provenance_status ON evidence_provenance(verification_status, handling_status);
