import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, CapacitorSQLitePlugin } from '@capacitor-community/sqlite';
import { defineCustomElements } from 'jeep-sqlite/loader';
import { destroyDeviceStorageSecret, getDeviceStorageSecret } from './deviceIdentity';

const sqlite: CapacitorSQLitePlugin = CapacitorSQLite;
const sqliteConnection = new SQLiteConnection(sqlite);
let dbInstance: any = null;
let webStoreReady: Promise<void> | null = null;
const DATABASE_NAME = 'crimegraph_db';

interface DatabaseSecurityMode {
  encrypted: boolean;
  mode: 'no-encryption' | 'encryption' | 'secret';
}

const prepareDatabaseSecurity = async (): Promise<DatabaseSecurityMode> => {
  if (!Capacitor.isNativePlatform()) return { encrypted: false, mode: 'no-encryption' };

  const storageSecret = await getDeviceStorageSecret();
  const hasStoredSecret = await sqliteConnection.isSecretStored();
  if (!hasStoredSecret.result) {
    await sqliteConnection.setEncryptionSecret(storageSecret);
  } else {
    const secretMatches = await sqliteConnection.checkEncryptionSecret(storageSecret);
    if (!secretMatches.result) throw new Error('Protected local storage cannot be unlocked with this device identity.');
  }

  const databaseExists = await sqliteConnection.isDatabase(DATABASE_NAME);
  if (!databaseExists.result) return { encrypted: true, mode: 'encryption' };
  const isEncrypted = await sqliteConnection.isDatabaseEncrypted(DATABASE_NAME);
  return { encrypted: true, mode: isEncrypted.result ? 'secret' : 'encryption' };
};

const initialiseWebStore = async (): Promise<void> => {
  if (Capacitor.getPlatform() !== 'web') return;
  if (!webStoreReady) {
    webStoreReady = (async () => {
      defineCustomElements(window);
      if (!document.querySelector('jeep-sqlite')) {
        const element = document.createElement('jeep-sqlite');
        element.setAttribute('autoSave', 'true');
        document.body.appendChild(element);
      }
      await customElements.whenDefined('jeep-sqlite');
      await sqliteConnection.initWebStore();
    })();
  }
  await webStoreReady;
};

export async function getDb() {
  if (dbInstance) return dbInstance;
  return await initDatabase();
}

export async function destroyProtectedLocalStorage(): Promise<void> {
  try {
    if (dbInstance) await dbInstance.close();
  } catch { /* Continue with connection cleanup. */ }
  try {
    const isConn = await sqliteConnection.isConnection(DATABASE_NAME, false);
    if (isConn.result) await sqliteConnection.closeConnection(DATABASE_NAME, false);
  } catch { /* A missing or already closed connection is safe to ignore. */ }
  try {
    await sqlite.deleteDatabase({ database: DATABASE_NAME });
  } catch { /* The database may already have been removed. */ }
  if (Capacitor.isNativePlatform()) {
    try { await sqliteConnection.clearEncryptionSecret(); } catch { /* Continue to destroy the device-held wrapping key. */ }
    await destroyDeviceStorageSecret();
  }
  dbInstance = null;
}

export async function initDatabase() {
  try {
    await initialiseWebStore();
    const securityMode = await prepareDatabaseSecurity();
    const isConn = await sqliteConnection.isConnection(DATABASE_NAME, false);
    let db;
    if (isConn.result) {
      db = await sqliteConnection.retrieveConnection(DATABASE_NAME, false);
    } else {
      db = await sqliteConnection.createConnection(DATABASE_NAME, securityMode.encrypted, securityMode.mode, 1, false);
    }
    await db.open();

    const createTables = `
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, badge TEXT UNIQUE NOT NULL, name TEXT NOT NULL, hash TEXT NOT NULL, role TEXT NOT NULL, biometric_enabled INTEGER DEFAULT 0, created_at TEXT NOT NULL, last_login TEXT);
      CREATE TABLE IF NOT EXISTS storage_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, reference_number TEXT UNIQUE NOT NULL, title TEXT NOT NULL, case_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', lead_officer_id TEXT, classification TEXT NOT NULL DEFAULT 'OFFICIAL', description TEXT, date_opened TEXT NOT NULL, date_closed TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS edges (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, source TEXT NOT NULL, target TEXT NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(case_id) REFERENCES cases(id));
      CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT, details TEXT, previous_hash TEXT, entry_hash TEXT);
      
      -- We ensure new installs get the attributes column
      CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, label TEXT NOT NULL, type TEXT NOT NULL, confidence INTEGER DEFAULT 3, created_at TEXT NOT NULL, occurred_at TEXT, attributes TEXT, FOREIGN KEY(case_id) REFERENCES cases(id));
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
    `;
    await db.execute(createTables);
    await db.run(
      'INSERT OR REPLACE INTO storage_metadata (key, value, updated_at) VALUES (?, ?, ?)',
      ['storage_encryption', Capacitor.isNativePlatform() ? 'device-bound-native' : 'web-preview-unencrypted', new Date().toISOString()],
    );
    
    // Live migrations are intentionally additive so existing device-local intelligence remains readable.
    for (const migration of [
      'ALTER TABLE nodes ADD COLUMN attributes TEXT;',
      'ALTER TABLE nodes ADD COLUMN occurred_at TEXT;',
      'ALTER TABLE audit_logs ADD COLUMN previous_hash TEXT;',
      'ALTER TABLE audit_logs ADD COLUMN entry_hash TEXT;',
      'ALTER TABLE users ADD COLUMN biometric_enabled INTEGER DEFAULT 0;',
      'ALTER TABLE users ADD COLUMN last_login TEXT;',
      'ALTER TABLE evidence_provenance ADD COLUMN attachment_name TEXT;',
      'ALTER TABLE evidence_provenance ADD COLUMN attachment_uri TEXT;',
      'ALTER TABLE evidence_provenance ADD COLUMN attachment_mime_type TEXT;',
      'ALTER TABLE evidence_provenance ADD COLUMN attachment_digest TEXT;',
    ]) {
      try {
        await db.execute(migration);
      } catch {
        // The column already exists or belongs to a legacy schema; authentication performs its own safe check.
      }
    }

    try {
      await db.execute("UPDATE users SET role = 'supervisor' WHERE role = 'sio';");
      await db.execute("UPDATE users SET role = 'field' WHERE role = 'officer';");
      await db.execute('CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_nodes_case_id ON nodes(case_id);');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_nodes_case_occurred_at ON nodes(case_id, occurred_at);');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_edges_case_id ON edges(case_id);');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_evidence_provenance_case_id ON evidence_provenance(case_id);');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_evidence_provenance_status ON evidence_provenance(verification_status, handling_status);');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_trusted_peers_status ON trusted_peers(status);');
    } catch (indexError) {
      console.warn('Database index creation skipped.', indexError);
    }

    try {
       await db.run('PRAGMA secure_delete = ON;');
    } catch (pragmaError) {
       console.warn('Forensic wiping PRAGMA bypassed.');
    }

    dbInstance = db;
    return db;
  } catch (error) {
    console.error('Database Error:', error);
    throw error;
  }
}
