import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// Single-user MVP: exactly one row lives in `users` (created at startup).
// Connecting Strava fills in the athlete/token columns on that row.
export const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  stravaAthleteId: integer("strava_athlete_id"),
  firstname: text("firstname"),
  lastname: text("lastname"),
  profile: text("profile"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: integer("token_expires_at"),
  lastSyncAt: integer("last_sync_at"),
  // Activities before this (unix seconds) never enter the system.
  // Defaults to the moment Strava was connected.
  startDate: integer("start_date"),
  createdAt: integer("created_at").notNull(),
});

export const rules = sqliteTable("rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sportType: text("sport_type").notNull(),
  metric: text("metric").notNull(), // miles | hours | elevation_feet
  pointsPerUnit: real("points_per_unit").notNull(),
  createdAt: integer("created_at").notNull(),
});

// Mirrors the Strava activity, with points computed at sync time.
// `id` is Strava's activity id, which also dedupes re-syncs.
export const activities = sqliteTable("activities", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  sportType: text("sport_type").notNull(),
  distanceMeters: real("distance_meters").notNull().default(0),
  movingTimeSeconds: integer("moving_time_seconds").notNull().default(0),
  elevationGainMeters: real("elevation_gain_meters").notNull().default(0),
  startDate: text("start_date").notNull(),
  pointsEarned: real("points_earned").notNull().default(0),
  syncedAt: integer("synced_at").notNull(),
});

// The reward menu. Capped at MAX_TREATS, floored at 1 (the redeem modal
// should never be empty). Ledger entries copy name/cost at redeem time,
// so editing or deleting a treat never rewrites history.
export const treats = sqliteTable("treats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  pointCost: real("point_cost").notNull(),
  createdAt: integer("created_at").notNull(),
});

// Append-only ledger. Balance = sum(earn) - sum(redeem). Points are
// captured here at earn time, so editing a rule never rewrites history.
export const ledger = sqliteTable("ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // earn | redeem
  points: real("points").notNull(), // always positive
  description: text("description").notNull(),
  activityId: integer("activity_id"),
  createdAt: integer("created_at").notNull(),
});
