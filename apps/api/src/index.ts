import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { MAX_TREATS, SPORT_METRICS } from "@pint-points/shared";
import type {
  Me,
  Metric,
  RecalculatePreview,
  RedeemItem,
  SportStat,
  SportType,
  SyncResult,
} from "@pint-points/shared";
import { db, schema } from "./db/index.js";
import { computePoints } from "./points.js";
import { authorizeUrl, exchangeCode, fetchActivities, stravaConfigured } from "./strava.js";

type Variables = { userId: number };
const app = new Hono<{ Variables: Variables }>().basePath("/api");

const now = () => Math.floor(Date.now() / 1000);
const webUrl = () => process.env.WEB_URL ?? "http://localhost:5173";
const SESSION_DURATION = 30 * 24 * 60 * 60; // 30 days

// Session auth middleware. Strava connect/callback are exempt since they
// initiate or complete the login flow.
app.use("*", async (c, next) => {
  const path = c.req.path;
  if (path === "/api/strava/connect" || path === "/api/strava/callback") {
    return next();
  }

  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "Not authenticated" }, 401);

  const session = db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.token, token))
    .get();
  if (!session || session.expiresAt < now()) {
    deleteCookie(c, "session", { path: "/" });
    return c.json({ error: "Session expired" }, 401);
  }

  c.set("userId", session.userId);
  return next();
});

const getUser = (userId: number) =>
  db.select().from(schema.users).where(eq(schema.users.id, userId)).get();

function getBalance(userId: number): number {
  const row = db
    .select({
      balance: sql<number>`coalesce(sum(case when ${schema.ledger.type} = 'earn' then ${schema.ledger.points} else -${schema.ledger.points} end), 0)`,
    })
    .from(schema.ledger)
    .where(eq(schema.ledger.userId, userId))
    .get();
  return Math.round((row?.balance ?? 0) * 10) / 10;
}

// ---- profile ----

app.get("/me", (c) => {
  const userId = c.get("userId");
  const user = getUser(userId);
  const me: Me = {
    connected: Boolean(user?.refreshToken),
    firstname: user?.firstname ?? null,
    lastname: user?.lastname ?? null,
    profile: user?.profile ?? null,
    stravaAthleteId: user?.stravaAthleteId ?? null,
    lastSyncAt: user?.lastSyncAt ?? null,
    startDate: user?.startDate ?? null,
    balance: getBalance(userId),
  };
  return c.json(me);
});

// ---- Strava OAuth / login ----

app.get("/strava/connect", (c) => {
  if (!stravaConfigured()) {
    return c.json(
      {
        error:
          "Strava credentials missing. Copy apps/api/.env.example to .env and fill them in.",
      },
      503,
    );
  }
  return c.redirect(authorizeUrl());
});

app.get("/strava/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.redirect(`${webUrl()}/?strava=denied`);

  let tokenRes;
  try {
    tokenRes = await exchangeCode(code);
  } catch {
    return c.redirect(`${webUrl()}/?error=strava_failed`);
  }

  const athlete = tokenRes.athlete;
  if (!athlete) return c.redirect(`${webUrl()}/?error=strava_failed`);

  // Whitelist: if set, only listed Strava athlete IDs can log in.
  const whitelist =
    process.env.STRAVA_WHITELIST?.split(",")
      .map(Number)
      .filter((n) => n > 0) ?? [];
  if (whitelist.length > 0 && !whitelist.includes(athlete.id)) {
    return c.redirect(`${webUrl()}/?error=not_allowed`);
  }

  // Upsert the user row. Three cases:
  //   1. Returning user: update tokens + profile.
  //   2. Legacy single-user row (id=1, no stravaAthleteId): claim it so
  //      existing activities/rules/ledger stay linked.
  //   3. New user: insert a fresh row and seed a default treat.
  let user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.stravaAthleteId, athlete.id))
    .get();

  const tokenFields = {
    firstname: athlete.firstname,
    lastname: athlete.lastname,
    profile: athlete.profile,
    accessToken: tokenRes.access_token,
    refreshToken: tokenRes.refresh_token,
    tokenExpiresAt: tokenRes.expires_at,
  };

  if (user) {
    // Returning user: refresh tokens only.
    db.update(schema.users).set(tokenFields).where(eq(schema.users.id, user.id)).run();
  } else {
    const legacy = db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, 1), isNull(schema.users.stravaAthleteId)))
      .get();

    if (legacy) {
      // Claim the legacy single-user row so existing data stays linked.
      user = db
        .update(schema.users)
        .set({ stravaAthleteId: athlete.id, ...tokenFields })
        .where(eq(schema.users.id, 1))
        .returning()
        .get()!;
    } else {
      // Brand-new user.
      user = db
        .insert(schema.users)
        .values({ stravaAthleteId: athlete.id, ...tokenFields, createdAt: now() })
        .returning()
        .get()!;
      db.insert(schema.treats)
        .values({ name: "🍺 Pint", pointCost: 10, createdAt: now(), userId: user.id })
        .run();
    }
  }

  // Default the points start date to "now" on first connect.
  db.update(schema.users)
    .set({ startDate: sql`coalesce(${schema.users.startDate}, unixepoch())` })
    .where(eq(schema.users.id, user!.id))
    .run();

  // Create a 30-day session.
  const sessionToken = crypto.randomUUID();
  db.insert(schema.sessions)
    .values({ token: sessionToken, userId: user!.id, expiresAt: now() + SESSION_DURATION })
    .run();

  const secure = process.env.NODE_ENV === "production";
  setCookie(c, "session", sessionToken, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DURATION,
  });

  return c.redirect(webUrl());
});

// ---- auth ----

app.post("/auth/logout", (c) => {
  const token = getCookie(c, "session");
  if (token) {
    db.delete(schema.sessions).where(eq(schema.sessions.token, token)).run();
  }
  deleteCookie(c, "session", { path: "/" });
  return c.json({ ok: true });
});

app.post("/strava/disconnect", (c) => {
  const userId = c.get("userId");
  db.update(schema.users)
    .set({ accessToken: null, refreshToken: null, tokenExpiresAt: null, lastSyncAt: null })
    .where(eq(schema.users.id, userId))
    .run();
  return c.json({ ok: true });
});

// ---- sync ----

async function performSync(userId: number): Promise<SyncResult> {
  const user = getUser(userId)!;
  const after = Math.max(
    user.startDate ?? 0,
    user.lastSyncAt ? user.lastSyncAt - 86400 : 0,
  );
  const fetched = await fetchActivities(userId, after);
  const allRules = db
    .select()
    .from(schema.rules)
    .where(eq(schema.rules.userId, userId))
    .all();

  let newActivities = 0;
  let pointsEarned = 0;
  for (const a of fetched) {
    const existing = db
      .select({ id: schema.activities.id })
      .from(schema.activities)
      .where(and(eq(schema.activities.id, a.id), eq(schema.activities.userId, userId)))
      .get();
    if (existing) continue;

    const points = computePoints(
      {
        sportType: a.sport_type,
        distanceMeters: a.distance,
        movingTimeSeconds: a.moving_time,
        elevationGainMeters: a.total_elevation_gain,
      },
      allRules,
    );
    db.insert(schema.activities)
      .values({
        id: a.id,
        userId,
        name: a.name,
        sportType: a.sport_type,
        distanceMeters: a.distance,
        movingTimeSeconds: a.moving_time,
        elevationGainMeters: a.total_elevation_gain,
        startDate: a.start_date,
        pointsEarned: points,
        syncedAt: now(),
      })
      .run();
    if (points > 0) {
      db.insert(schema.ledger)
        .values({
          userId,
          type: "earn",
          points,
          description: a.name,
          activityId: a.id,
          createdAt: Math.floor(Date.parse(a.start_date) / 1000),
        })
        .run();
    }
    newActivities++;
    pointsEarned += points;
  }

  db.update(schema.users).set({ lastSyncAt: now() }).where(eq(schema.users.id, userId)).run();
  return { newActivities, pointsEarned: Math.round(pointsEarned * 10) / 10 };
}

app.post("/sync", async (c) => {
  const userId = c.get("userId");
  if (!getUser(userId)?.refreshToken) return c.json({ error: "Strava is not connected" }, 400);
  return c.json(await performSync(userId));
});

app.post("/resync", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ startDate: number }>().catch(() => null);
  const startDate = Number(body?.startDate);
  if (!(startDate > 0)) return c.json({ error: "Invalid start date" }, 400);
  if (!getUser(userId)?.refreshToken) return c.json({ error: "Strava is not connected" }, 400);

  db.update(schema.users)
    .set({ startDate, lastSyncAt: null })
    .where(eq(schema.users.id, userId))
    .run();
  db.delete(schema.activities).where(eq(schema.activities.userId, userId)).run();
  db.delete(schema.ledger)
    .where(and(eq(schema.ledger.userId, userId), eq(schema.ledger.type, "earn")))
    .run();
  return c.json(await performSync(userId));
});

// ---- recalculate ----

function recalculatedEntries(userId: number) {
  const allRules = db.select().from(schema.rules).where(eq(schema.rules.userId, userId)).all();
  return db
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.userId, userId))
    .all()
    .map((activity) => ({ activity, points: computePoints(activity, allRules) }));
}

app.get("/recalculate/preview", (c) => {
  const userId = c.get("userId");
  const newEarned = recalculatedEntries(userId).reduce((sum, e) => sum + e.points, 0);
  const redeemed =
    db
      .select({ s: sql<number>`coalesce(sum(${schema.ledger.points}), 0)` })
      .from(schema.ledger)
      .where(and(eq(schema.ledger.userId, userId), eq(schema.ledger.type, "redeem")))
      .get()?.s ?? 0;
  const preview: RecalculatePreview = {
    currentBalance: getBalance(userId),
    newBalance: Math.round((newEarned - redeemed) * 10) / 10,
  };
  return c.json(preview);
});

app.post("/recalculate", (c) => {
  const userId = c.get("userId");
  for (const { activity, points } of recalculatedEntries(userId)) {
    db.update(schema.activities)
      .set({ pointsEarned: points })
      .where(eq(schema.activities.id, activity.id))
      .run();
    const entry = db
      .select()
      .from(schema.ledger)
      .where(
        and(eq(schema.ledger.activityId, activity.id), eq(schema.ledger.userId, userId)),
      )
      .get();
    if (entry && points > 0) {
      db.update(schema.ledger).set({ points }).where(eq(schema.ledger.id, entry.id)).run();
    } else if (entry && points === 0) {
      db.delete(schema.ledger).where(eq(schema.ledger.id, entry.id)).run();
    } else if (!entry && points > 0) {
      db.insert(schema.ledger)
        .values({
          userId,
          type: "earn",
          points,
          description: activity.name,
          activityId: activity.id,
          createdAt: Math.floor(Date.parse(activity.startDate) / 1000),
        })
        .run();
    }
  }
  return c.json({ balance: getBalance(userId) });
});

// ---- rules ----

app.get("/rules", (c) => {
  const userId = c.get("userId");
  return c.json(
    db
      .select()
      .from(schema.rules)
      .where(eq(schema.rules.userId, userId))
      .orderBy(schema.rules.sportType)
      .all(),
  );
});

interface RuleInput {
  sportType: string;
  metric: string;
  pointsPerUnit: number;
}

function validRule(body: RuleInput): boolean {
  const allowedMetrics = SPORT_METRICS[body.sportType as SportType] as
    | readonly Metric[]
    | undefined;
  return Boolean(allowedMetrics?.includes(body.metric as Metric)) && body.pointsPerUnit > 0;
}

app.post("/rules", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<RuleInput>();
  if (!validRule(body)) return c.json({ error: "Invalid rule" }, 400);
  const rule = db
    .insert(schema.rules)
    .values({
      userId,
      sportType: body.sportType,
      metric: body.metric,
      pointsPerUnit: body.pointsPerUnit,
      createdAt: now(),
    })
    .returning()
    .get();
  return c.json(rule, 201);
});

app.patch("/rules/:id", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<RuleInput>();
  if (!validRule(body)) return c.json({ error: "Invalid rule" }, 400);
  const rule = db
    .update(schema.rules)
    .set({ sportType: body.sportType, metric: body.metric, pointsPerUnit: body.pointsPerUnit })
    .where(and(eq(schema.rules.id, Number(c.req.param("id"))), eq(schema.rules.userId, userId)))
    .returning()
    .get();
  if (!rule) return c.json({ error: "Rule not found" }, 404);
  return c.json(rule);
});

app.delete("/rules/:id", (c) => {
  const userId = c.get("userId");
  db.delete(schema.rules)
    .where(and(eq(schema.rules.id, Number(c.req.param("id"))), eq(schema.rules.userId, userId)))
    .run();
  return c.body(null, 204);
});

// ---- activities & ledger ----

app.get("/activities", (c) => {
  const userId = c.get("userId");
  return c.json(
    db
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.userId, userId))
      .orderBy(desc(schema.activities.startDate))
      .all(),
  );
});

app.get("/sport-stats", (c) => {
  const userId = c.get("userId");
  const stats: SportStat[] = db
    .select({
      sportType: schema.activities.sportType,
      count: sql<number>`count(*)`,
      zeroPoints: sql<number>`sum(case when ${schema.activities.pointsEarned} = 0 then 1 else 0 end)`,
    })
    .from(schema.activities)
    .where(eq(schema.activities.userId, userId))
    .groupBy(schema.activities.sportType)
    .orderBy(desc(sql`count(*)`))
    .all();
  return c.json(stats);
});

app.get("/ledger", (c) => {
  const userId = c.get("userId");
  return c.json(
    db
      .select()
      .from(schema.ledger)
      .where(eq(schema.ledger.userId, userId))
      .orderBy(desc(schema.ledger.createdAt), desc(schema.ledger.id))
      .all(),
  );
});

app.post("/redeem", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ items: RedeemItem[] }>().catch(() => null);
  const items = (body?.items ?? []).filter((i) => Number.isInteger(i.quantity) && i.quantity > 0);
  if (!items.length) return c.json({ error: "Nothing to redeem" }, 400);

  const lines: Array<{ points: number; description: string }> = [];
  for (const item of items) {
    const treat = db
      .select()
      .from(schema.treats)
      .where(and(eq(schema.treats.id, item.treatId), eq(schema.treats.userId, userId)))
      .get();
    if (!treat) return c.json({ error: "Unknown treat" }, 400);
    lines.push({
      points: Math.round(treat.pointCost * item.quantity * 10) / 10,
      description: `${item.quantity}x ${treat.name}`,
    });
  }

  const total = Math.round(lines.reduce((sum, l) => sum + l.points, 0) * 10) / 10;
  if (total > getBalance(userId)) {
    return c.json({ error: "Not enough points. Go earn it first 🏃" }, 400);
  }

  for (const line of lines) {
    db.insert(schema.ledger)
      .values({
        userId,
        type: "redeem",
        points: line.points,
        description: line.description,
        createdAt: now(),
      })
      .run();
  }
  return c.json({ total, balance: getBalance(userId) }, 201);
});

// ---- treats ----

app.get("/treats", (c) => {
  const userId = c.get("userId");
  return c.json(
    db
      .select()
      .from(schema.treats)
      .where(eq(schema.treats.userId, userId))
      .orderBy(schema.treats.id)
      .all(),
  );
});

const validTreat = (body: { name?: string; pointCost?: number }) =>
  Boolean(body.name?.trim()) && Number(body.pointCost) > 0;

app.post("/treats", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ name: string; pointCost: number }>();
  if (!validTreat(body)) return c.json({ error: "Invalid treat" }, 400);
  const count = db
    .select()
    .from(schema.treats)
    .where(eq(schema.treats.userId, userId))
    .all().length;
  if (count >= MAX_TREATS) {
    return c.json({ error: `Keep the menu curated: max ${MAX_TREATS} treats` }, 400);
  }
  const treat = db
    .insert(schema.treats)
    .values({ userId, name: body.name.trim(), pointCost: body.pointCost, createdAt: now() })
    .returning()
    .get();
  return c.json(treat, 201);
});

app.patch("/treats/:id", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ name: string; pointCost: number }>();
  if (!validTreat(body)) return c.json({ error: "Invalid treat" }, 400);
  const treat = db
    .update(schema.treats)
    .set({ name: body.name.trim(), pointCost: body.pointCost })
    .where(
      and(eq(schema.treats.id, Number(c.req.param("id"))), eq(schema.treats.userId, userId)),
    )
    .returning()
    .get();
  if (!treat) return c.json({ error: "Treat not found" }, 404);
  return c.json(treat);
});

app.delete("/treats/:id", (c) => {
  const userId = c.get("userId");
  const count = db
    .select()
    .from(schema.treats)
    .where(eq(schema.treats.userId, userId))
    .all().length;
  if (count <= 1) return c.json({ error: "Keep at least one treat. You earned it!" }, 400);
  db.delete(schema.treats)
    .where(
      and(eq(schema.treats.id, Number(c.req.param("id"))), eq(schema.treats.userId, userId)),
    )
    .run();
  return c.body(null, 204);
});

const port = Number(process.env.PORT) || 8787;
serve({ fetch: app.fetch, port });
console.log(`pint-points api listening on http://localhost:${port}`);
if (!stravaConfigured()) {
  console.log("⚠ Strava credentials not set. Copy .env.example to .env to enable connect/sync.");
}
