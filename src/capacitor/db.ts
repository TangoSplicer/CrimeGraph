import { CapacitorSQLite, SQLiteConnection, CapacitorSQLitePlugin } from '@capacitor-community/sqlite';

const sqlite: CapacitorSQLitePlugin = CapacitorSQLite;
const sqliteConnection = new SQLiteConnection(sqlite);
let dbInstance: any = null;

export async function getDb() {
  if (dbInstance) return dbInstance;
  return await initDatabase();
}

export async function initDatabase() {
  try {
    const isConn = await sqliteConnection.isConnection('crimegraph_db', false);
    let db;
    if (isConn.result) {
      db = await sqliteConnection.retrieveConnection('crimegraph_db', false);
    } else {
      db = await sqliteConnection.createConnection('crimegraph_db', false, 'no-encryption', 1, false);
    }
    
    await db.open();

    const createTables = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
        role TEXT NOT NULL, display_name TEXT NOT NULL, force_unit TEXT,
        biometric_enabled INTEGER DEFAULT 0, created_at TEXT NOT NULL, last_login TEXT, is_active INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS cases (
        id TEXT PRIMARY KEY, reference_number TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
        case_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', lead_officer_id TEXT,
        classification TEXT NOT NULL DEFAULT 'OFFICIAL', description TEXT, date_opened TEXT NOT NULL,
        date_closed TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY, case_id TEXT NOT NULL, label TEXT NOT NULL,
        type TEXT NOT NULL, confidence INTEGER DEFAULT 3, created_at TEXT NOT NULL,
        FOREIGN KEY(case_id) REFERENCES cases(id)
      );

      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY, case_id TEXT NOT NULL, source TEXT NOT NULL,
        target TEXT NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY(case_id) REFERENCES cases(id),
        FOREIGN KEY(source) REFERENCES nodes(id),
        FOREIGN KEY(target) REFERENCES nodes(id)
      );

      -- 🚀 PHASE 9: Immutable Audit Ledger
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT,
        details TEXT
      );
    `;
    await db.execute(createTables);
    dbInstance = db;
    return db;
  } catch (error) {
    console.error('Database Error:', error);
    throw error;
  }
}
