CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','sio','analyst','officer','readonly')),
  display_name TEXT NOT NULL,
  force_unit TEXT,
  biometric_enabled INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  reference_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  case_type TEXT NOT NULL CHECK(case_type IN ('major_crime','missing_person','organised_crime','other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','pending_review','closed','archived')),
  lead_officer_id TEXT REFERENCES users(id),
  classification TEXT NOT NULL DEFAULT 'OFFICIAL',
  description TEXT,
  date_opened TEXT NOT NULL,
  date_closed TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Additional tables (nodes, edges, attachments, audit_log) will be initialized here.
