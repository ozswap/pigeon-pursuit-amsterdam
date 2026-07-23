import { Filter } from 'bad-words';

const filter = new Filter();

export function sanitizeUsername(name: string): string | null {
  const trimmed = name.trim().slice(0, 16);
  if (!trimmed || trimmed.length < 2) return null;
  if (filter.isProfane(trimmed)) return null;
  return trimmed;
}

export function validateScore(
  score: number,
  startedAt: number,
  pastries: number,
  levelReached: number
): string | null {
  if (!Number.isInteger(score) || score < 0 || score > 999999) {
    return 'Invalid score';
  }
  if (!Number.isInteger(pastries) || pastries < 0 || pastries > 10) {
    return 'Invalid pastries';
  }
  if (!Number.isInteger(levelReached) || levelReached < 1 || levelReached > 99) {
    return 'Invalid level';
  }
  const durationSec = Math.max(1, (Date.now() - startedAt) / 1000);
  const rate = score / durationSec;
  if (rate > 800) {
    return 'Score rejected: implausible rate';
  }
  return null;
}
