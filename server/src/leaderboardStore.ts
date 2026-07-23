import { randomUUID } from 'crypto';

export interface LeaderboardEntry {
  id: string;
  username: string;
  score: number;
  pastries: number;
  level_reached: number;
  created_at: Date;
}

export interface LeaderboardRow {
  username: string;
  score: number;
  pastries: number;
  level_reached: number;
  created_at: string;
}

const entries: LeaderboardEntry[] = [];

export function addLeaderboardEntry(
  username: string,
  score: number,
  pastries: number,
  levelReached: number
): number {
  const record: LeaderboardEntry = {
    id: randomUUID(),
    username,
    score,
    pastries,
    level_reached: levelReached,
    created_at: new Date(),
  };
  entries.push(record);
  return entries.filter((e) => e.score > score).length + 1;
}

export function getTopScores(limit: number, timeframe: string): LeaderboardRow[] {
  const now = Date.now();
  let cutoff = 0;
  if (timeframe === 'weekly') {
    cutoff = now - 7 * 24 * 60 * 60 * 1000;
  } else if (timeframe === 'monthly') {
    cutoff = now - 30 * 24 * 60 * 60 * 1000;
  }

  return entries
    .filter((e) => timeframe === 'all' || e.created_at.getTime() >= cutoff)
    .sort(
      (a, b) =>
        b.score - a.score || a.created_at.getTime() - b.created_at.getTime()
    )
    .slice(0, limit)
    .map(({ username, score, pastries, level_reached, created_at }) => ({
      username,
      score,
      pastries,
      level_reached,
      created_at: created_at.toISOString(),
    }));
}

export function clearLeaderboard(): void {
  entries.length = 0;
}
