import type {
  Activity,
  LedgerEntry,
  Me,
  Metric,
  RecalculatePreview,
  RedeemItem,
  Rule,
  SportStat,
  SyncResult,
  Treat,
} from "@pint-points/shared";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  me: () => request<Me>("/api/me"),
  sync: () => request<SyncResult>("/api/sync", { method: "POST" }),
  resync: (startDate: number) =>
    request<SyncResult>("/api/resync", { method: "POST", body: JSON.stringify({ startDate }) }),
  recalculatePreview: () => request<RecalculatePreview>("/api/recalculate/preview"),
  sportStats: () => request<SportStat[]>("/api/sport-stats"),
  recalculate: () => request<{ balance: number }>("/api/recalculate", { method: "POST" }),
  rules: () => request<Rule[]>("/api/rules"),
  createRule: (rule: { sportType: string; metric: Metric; pointsPerUnit: number }) =>
    request<Rule>("/api/rules", { method: "POST", body: JSON.stringify(rule) }),
  updateRule: (id: number, rule: { sportType: string; metric: Metric; pointsPerUnit: number }) =>
    request<Rule>(`/api/rules/${id}`, { method: "PATCH", body: JSON.stringify(rule) }),
  deleteRule: (id: number) => request<void>(`/api/rules/${id}`, { method: "DELETE" }),
  activities: () => request<Activity[]>("/api/activities"),
  ledger: () => request<LedgerEntry[]>("/api/ledger"),
  redeem: (items: RedeemItem[]) =>
    request<{ total: number; balance: number }>("/api/redeem", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  treats: () => request<Treat[]>("/api/treats"),
  createTreat: (treat: { name: string; pointCost: number }) =>
    request<Treat>("/api/treats", { method: "POST", body: JSON.stringify(treat) }),
  updateTreat: (id: number, treat: { name: string; pointCost: number }) =>
    request<Treat>(`/api/treats/${id}`, { method: "PATCH", body: JSON.stringify(treat) }),
  deleteTreat: (id: number) => request<void>(`/api/treats/${id}`, { method: "DELETE" }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  disconnectStrava: () => request<{ ok: boolean }>("/api/strava/disconnect", { method: "POST" }),
};
