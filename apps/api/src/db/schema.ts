import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  stravaAthleteId: integer("strava_athlete_id").unique(),
  firstname: text("firstname"),
  lastname: text("lastname"),
  profile: text("profile"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: integer("token_expires_at"),
  lastSyncAt: integer("last_sync_at"),
  startDate: integer("start_date"),
  createdAt: integer("created_at").notNull(),
});

// Browser sessions: set as an HTTP-only cookie after Strava OAuth.
// One row per login; logout deletes the row.
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const rules = sqliteTable("rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  sportType: text("sport_type").notNull(),
  metric: text("metric").notNull(),
  pointsPerUnit: real("points_per_unit").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const activities = sqliteTable("activities", {
  id: integer("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  sportType: text("sport_type").notNull(),
  distanceMeters: real("distance_meters").notNull().default(0),
  movingTimeSeconds: integer("moving_time_seconds").notNull().default(0),
  elevationGainMeters: real("elevation_gain_meters").notNull().default(0),
  startDate: text("start_date").notNull(),
  pointsEarned: real("points_earned").notNull().default(0),
  syncedAt: integer("synced_at").notNull(),
});

export const treats = sqliteTable("treats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  pointCost: real("point_cost").notNull(),
  createdAt: integer("created_at").notNull(),
});

// Append-only ledger. Balance = sum(earn) - sum(redeem).
export const ledger = sqliteTable("ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // earn | redeem
  points: real("points").notNull(),
  description: text("description").notNull(),
  activityId: integer("activity_id"),
  createdAt: integer("created_at").notNull(),
});
