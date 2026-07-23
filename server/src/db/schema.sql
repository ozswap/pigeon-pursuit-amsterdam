CREATE TABLE IF NOT EXISTS global_leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(16) NOT NULL,
  score INTEGER NOT NULL,
  pastries INTEGER NOT NULL,
  level_reached INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON global_leaderboard (score DESC, created_at ASC);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name VARCHAR(64) NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
