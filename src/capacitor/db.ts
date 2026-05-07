import { CapacitorSQLite, SQLiteConnection, CapacitorSQLitePlugin } from '@capacitor-community/sqlite';

const sqlite: CapacitorSQLitePlugin = CapacitorSQLite;
const sqliteConnection = new SQLiteConnection(sqlite);

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

    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        display_name TEXT NOT NULL,
        force_unit TEXT,
        biometric_enabled INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        last_login TEXT,
        is_active INTEGER DEFAULT 1
      );
    `;
    await db.execute(createUsersTable);
    
    return db;
  } catch (error) {
    console.error('Database Error:', error);
    throw error;
  }
}
