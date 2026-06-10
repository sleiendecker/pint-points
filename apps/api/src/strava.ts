import { eq } from "drizzle-orm";
import { db, schema } from "./db/index.js";

// Strava OAuth in three steps:
//   1. We send the browser to strava.com/oauth/authorize (authorizeUrl)
//   2. Strava redirects back to our /api/strava/callback with a one-time code
//   3. We exchange that code for an access token + refresh token (exchangeCode)
// Access tokens die after 6 hours; getFreshAccessToken silently swaps the
// refresh token for a new pair whenever we're close to expiry.

// Strava is moving the API host: after June 1, 2027 this must become
// https://www.api-v3.strava.com (per their June 2026 developer email).
// OAuth endpoints stay on www.strava.com.
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

const clientId = () => process.env.STRAVA_CLIENT_ID ?? "";
const clientSecret = () => process.env.STRAVA_CLIENT_SECRET ?? "";
const apiUrl = () => process.env.API_URL ?? "http://localhost:8787";

export function stravaConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

export function authorizeUrl(): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: `${apiUrl()}/api/strava/callback`,
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all",
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  athlete?: { id: number; firstname: string; lastname: string; profile: string };
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId(), client_secret: clientSecret(), ...body }),
  });
  if (!res.ok) {
    throw new Error(`Strava token request failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function exchangeCode(code: string): Promise<void> {
  const token = await tokenRequest({ code, grant_type: "authorization_code" });
  await db
    .update(schema.users)
    .set({
      stravaAthleteId: token.athlete?.id,
      firstname: token.athlete?.firstname,
      lastname: token.athlete?.lastname,
      profile: token.athlete?.profile,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenExpiresAt: token.expires_at,
    })
    .where(eq(schema.users.id, 1));
}

async function getFreshAccessToken(): Promise<string> {
  const user = db.select().from(schema.users).where(eq(schema.users.id, 1)).get();
  if (!user?.refreshToken) throw new Error("Strava is not connected yet");

  const now = Math.floor(Date.now() / 1000);
  if (user.accessToken && user.tokenExpiresAt && user.tokenExpiresAt > now + 60) {
    return user.accessToken;
  }

  const token = await tokenRequest({
    refresh_token: user.refreshToken,
    grant_type: "refresh_token",
  });
  await db
    .update(schema.users)
    .set({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenExpiresAt: token.expires_at,
    })
    .where(eq(schema.users.id, 1));
  return token.access_token;
}

export interface StravaActivity {
  id: number;
  name: string;
  sport_type: string;
  distance: number; // meters
  moving_time: number; // seconds
  total_elevation_gain: number; // meters
  start_date: string; // ISO
}

/**
 * Fetch activities newer than `after` (unix seconds), oldest first.
 * Page cap = 3000 activities (30 requests), well inside Strava's
 * 200-requests-per-15-min limit even on a full-history first sync.
 */
export async function fetchActivities(after: number): Promise<StravaActivity[]> {
  const accessToken = await getFreshAccessToken();
  const all: StravaActivity[] = [];
  for (let page = 1; page <= 30; page++) {
    const params = new URLSearchParams({
      after: String(after),
      per_page: "100",
      page: String(page),
    });
    const res = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Strava activities request failed (${res.status}): ${await res.text()}`);
    }
    const batch = (await res.json()) as StravaActivity[];
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}
