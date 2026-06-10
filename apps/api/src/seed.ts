// Demo data so the UI has something to show before Strava is connected.
// Run with: pnpm --filter api seed   (safe to re-run; it wipes demo rows first)
import { db, schema } from "./db/index.js";
import { computePoints } from "./points.js";

const now = Math.floor(Date.now() / 1000);
const day = 86400;

db.delete(schema.ledger).run();
db.delete(schema.activities).run();
db.delete(schema.rules).run();

const rules = db
  .insert(schema.rules)
  .values([
    { sportType: "Run", metric: "miles", pointsPerUnit: 1, createdAt: now },
    { sportType: "WeightTraining", metric: "hours", pointsPerUnit: 1, createdAt: now },
    { sportType: "Ride", metric: "miles", pointsPerUnit: 0.3, createdAt: now },
  ])
  .returning()
  .all();

const demoActivities = [
  { id: 1, name: "Morning Run", sportType: "Run", distanceMeters: 8047, movingTimeSeconds: 2700, elevationGainMeters: 50, daysAgo: 6 },
  { id: 2, name: "Push Day", sportType: "WeightTraining", distanceMeters: 0, movingTimeSeconds: 4500, elevationGainMeters: 0, daysAgo: 5 },
  { id: 3, name: "Lunch Ride", sportType: "Ride", distanceMeters: 24140, movingTimeSeconds: 3600, elevationGainMeters: 200, daysAgo: 3 },
  { id: 4, name: "Tempo Tuesday", sportType: "Run", distanceMeters: 9656, movingTimeSeconds: 2880, elevationGainMeters: 30, daysAgo: 1 },
];

for (const a of demoActivities) {
  const points = computePoints(a, rules);
  const startDate = new Date((now - a.daysAgo * day) * 1000).toISOString();
  db.insert(schema.activities)
    .values({ ...a, startDate, pointsEarned: points, syncedAt: now })
    .run();
  db.insert(schema.ledger)
    .values({
      type: "earn",
      points,
      description: a.name,
      activityId: a.id,
      createdAt: now - a.daysAgo * day,
    })
    .run();
}

db.insert(schema.ledger)
  .values({ type: "redeem", points: 5, description: "🍺 Post-run IPA", createdAt: now - 2 * day })
  .run();

console.log("Seeded demo rules, activities, and ledger. 🍻");
