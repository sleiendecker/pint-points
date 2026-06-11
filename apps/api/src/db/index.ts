import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data");
mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(path.join(dataDir, "pint-points.db"));
sqlite.pragma("journal_mode = WAL");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strava_athlete_id INTEGER UNIQUE,
    firstname TEXT,
    lastname TEXT,
    profile TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at INTEGER,
    last_sync_at INTEGER,
    start_date INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    sport_type TEXT NOT NULL,
    metric TEXT NOT NULL,
    points_per_unit REAL NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    sport_type TEXT NOT NULL,
    distance_meters REAL NOT NULL DEFAULT 0,
    moving_time_seconds INTEGER NOT NULL DEFAULT 0,
    elevation_gain_meters REAL NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL,
    points_earned REAL NOT NULL DEFAULT 0,
    synced_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    type TEXT NOT NULL,
    points REAL NOT NULL,
    description TEXT NOT NULL,
    activity_id INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS treats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    point_cost REAL NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

// Migrations: columns added after initial release need explicit ALTERs.
// Each check is idempotent so the dev server can restart freely.
const col = (table: string) =>
  (sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (r) => r.name,
  );

const userCols = col("users");
if (!userCols.includes("start_date")) {
  sqlite.exec("ALTER TABLE users ADD COLUMN start_date INTEGER");
}

const addUserId = (table: string) => {
  if (!col(table).includes("user_id")) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1`);
  }
};
addUserId("rules");
addUserId("activities");
addUserId("ledger");
addUserId("treats");

export const db = drizzle(sqlite, { schema });
export { schema };
