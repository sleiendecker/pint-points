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

// Self-initializing schema: CREATE TABLE IF NOT EXISTS keeps `pnpm dev` a
// one-step start. If the schema evolves later, drizzle-kit migrations are
// the upgrade path.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    strava_athlete_id INTEGER,
    firstname TEXT,
    lastname TEXT,
    profile TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at INTEGER,
    last_sync_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sport_type TEXT NOT NULL,
    metric TEXT NOT NULL,
    points_per_unit REAL NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY,
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
    type TEXT NOT NULL,
    points REAL NOT NULL,
    description TEXT NOT NULL,
    activity_id INTEGER,
    created_at INTEGER NOT NULL
  );
  INSERT INTO users (id, created_at)
    SELECT 1, unixepoch() WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = 1);
  CREATE TABLE IF NOT EXISTS treats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    point_cost REAL NOT NULL,
    created_at INTEGER NOT NULL
  );
  INSERT INTO treats (name, point_cost, created_at)
    SELECT '🍺 Pint', 10, unixepoch() WHERE NOT EXISTS (SELECT 1 FROM treats);
`);

// Mini-migration: CREATE TABLE IF NOT EXISTS doesn't touch existing tables,
// so columns added after a DB was first created need an explicit ALTER.
const userColumns = sqlite
  .prepare("PRAGMA table_info(users)")
  .all() as Array<{ name: string }>;
if (!userColumns.some((c) => c.name === "start_date")) {
  sqlite.exec("ALTER TABLE users ADD COLUMN start_date INTEGER");
}

export const db = drizzle(sqlite, { schema });
export { schema };
