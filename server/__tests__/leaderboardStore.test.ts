import {
  addLeaderboardEntry,
  getTopScores,
  clearLeaderboard,
} from '../src/leaderboardStore.js';

describe('leaderboardStore', () => {
  beforeEach(() => {
    clearLeaderboard();
  });

  it('adds entries and returns rank', () => {
    expect(addLeaderboardEntry('Alice', 100, 3, 1)).toBe(1);
    expect(addLeaderboardEntry('Bob', 200, 5, 2)).toBe(1);
    expect(addLeaderboardEntry('Carol', 150, 4, 2)).toBe(2);
  });

  it('returns top scores sorted by score desc', () => {
    addLeaderboardEntry('Alice', 100, 3, 1);
    addLeaderboardEntry('Bob', 300, 5, 3);
    addLeaderboardEntry('Carol', 200, 4, 2);

    const top = getTopScores(10, 'all');
    expect(top.map((e) => e.username)).toEqual(['Bob', 'Carol', 'Alice']);
    expect(top[0].pastries).toBe(5);
    expect(top[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('respects limit', () => {
    addLeaderboardEntry('Alice', 100, 3, 1);
    addLeaderboardEntry('Bob', 200, 5, 2);
    expect(getTopScores(1, 'all')).toHaveLength(1);
  });
});
