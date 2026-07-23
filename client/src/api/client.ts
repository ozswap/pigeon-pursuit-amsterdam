const API_BASE = import.meta.env.VITE_API_URL ?? '';

export interface SessionResponse {
  token: string;
  session_hash: string;
}

export interface LeaderboardEntry {
  username: string;
  score: number;
  pastries: number;
  level_reached: number;
  created_at: string;
}

let sessionToken = '';
let sessionHash = '';

export async function createSession(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/session`, { method: 'POST' });
    if (!res.ok) return;
    const data: SessionResponse = await res.json();
    sessionToken = data.token;
    sessionHash = data.session_hash;
  } catch {
    /* offline play ok */
  }
}

export async function submitScore(
  username: string,
  score: number,
  pastries: number,
  levelReached: number
): Promise<number | null> {
  if (!sessionToken) return null;
  try {
    const res = await fetch(`${API_BASE}/api/v1/scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        username,
        score,
        pastries_saved: pastries,
        level_reached: levelReached,
        session_hash: sessionHash,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.rank as number;
  } catch {
    return null;
  }
}

export async function fetchLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/scores/top?limit=${limit}&timeframe=weekly`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export function sendTelemetry(event: string, payload?: Record<string, unknown>) {
  fetch(`${API_BASE}/api/v1/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, payload }),
  }).catch(() => {});
}
