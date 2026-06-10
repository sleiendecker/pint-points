// Types shared between the web app and the API. The API is the source of
// truth for these shapes; its route handlers return exactly these.

/** Strava sport types we offer rules for. Strava has ~50; these cover the common ones. */
export const SPORT_TYPES = [
  "Run",
  "TrailRun",
  "Ride",
  "MountainBikeRide",
  "GravelRide",
  "VirtualRide",
  "Walk",
  "Hike",
  "Swim",
  "WeightTraining",
  "Workout",
  "Yoga",
  "Rowing",
  "Elliptical",
  "StairStepper",
] as const;
export type SportType = (typeof SPORT_TYPES)[number];

/** What an earning rule measures. Conversions happen API-side from Strava's metric units. */
export const METRICS = ["miles", "hours", "elevation_feet"] as const;
export type Metric = (typeof METRICS)[number];

export const METRIC_LABELS: Record<Metric, string> = {
  miles: "per mile",
  hours: "per hour",
  elevation_feet: "per ft of climbing",
};

/**
 * Which metrics make sense per sport. No "per mile" weightlifting.
 * Used by the rules UI (dropdown filtering) and the API (validation).
 */
const DISTANCE_SPORTS = ["miles", "hours", "elevation_feet"] as const;
const WATER_SPORTS = ["miles", "hours"] as const;
const TIME_ONLY = ["hours"] as const;

export const SPORT_METRICS: Record<SportType, readonly Metric[]> = {
  Run: DISTANCE_SPORTS,
  TrailRun: DISTANCE_SPORTS,
  Ride: DISTANCE_SPORTS,
  MountainBikeRide: DISTANCE_SPORTS,
  GravelRide: DISTANCE_SPORTS,
  Walk: DISTANCE_SPORTS,
  Hike: DISTANCE_SPORTS,
  // Virtual elevation isn't real climbing, so distance and time only
  VirtualRide: WATER_SPORTS,
  Swim: WATER_SPORTS,
  Rowing: WATER_SPORTS,
  WeightTraining: TIME_ONLY,
  Workout: TIME_ONLY,
  Yoga: TIME_ONLY,
  Elliptical: TIME_ONLY,
  StairStepper: TIME_ONLY,
};

export interface Rule {
  id: number;
  sportType: string;
  metric: Metric;
  pointsPerUnit: number;
  createdAt: number;
}

export interface Activity {
  id: number;
  name: string;
  sportType: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  elevationGainMeters: number;
  startDate: string;
  pointsEarned: number;
}

/** A curated menu, not a database. Keeps the redeem modal one screen. */
export const MAX_TREATS = 5;

export interface Treat {
  id: number;
  name: string;
  pointCost: number;
  createdAt: number;
}

export interface RedeemItem {
  treatId: number;
  quantity: number;
}

export type LedgerType = "earn" | "redeem";

export interface LedgerEntry {
  id: number;
  type: LedgerType;
  /** Always positive; `type` determines the sign. */
  points: number;
  description: string;
  activityId: number | null;
  createdAt: number;
}

export interface Me {
  connected: boolean;
  firstname: string | null;
  lastname: string | null;
  profile: string | null;
  lastSyncAt: number | null;
  /** Unix seconds; activities before this never earn points. Set when Strava connects. */
  startDate: number | null;
  balance: number;
}

export interface SyncResult {
  newActivities: number;
  pointsEarned: number;
}

export interface RecalculatePreview {
  currentBalance: number;
  newBalance: number;
}

/** Per-sport rollup of imported activities; powers rule suggestions. */
export interface SportStat {
  sportType: string;
  count: number;
  zeroPoints: number;
}
