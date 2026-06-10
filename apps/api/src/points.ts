import type { Metric } from "@pint-points/shared";

interface ActivityMeasures {
  sportType: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  elevationGainMeters: number;
}

interface RuleLike {
  sportType: string;
  metric: string;
  pointsPerUnit: number;
}

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

function metricValue(activity: ActivityMeasures, metric: Metric): number {
  switch (metric) {
    case "miles":
      return activity.distanceMeters / METERS_PER_MILE;
    case "hours":
      return activity.movingTimeSeconds / 3600;
    case "elevation_feet":
      return activity.elevationGainMeters * FEET_PER_METER;
  }
}

/**
 * Every rule matching the activity's sport type contributes, so
 * "Run: 1 pt/mile" and "Run: 0.5 pt/100ft" can stack.
 */
export function computePoints(activity: ActivityMeasures, allRules: RuleLike[]): number {
  let points = 0;
  for (const rule of allRules) {
    if (rule.sportType !== activity.sportType) continue;
    points += metricValue(activity, rule.metric as Metric) * rule.pointsPerUnit;
  }
  return Math.round(points * 10) / 10;
}
