import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const dbPath = process.env.DB_PATH || join(process.cwd(), 'data', 'game.db')
mkdirSync(dirname(dbPath), { recursive: true })

export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  pin TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  mode TEXT NOT NULL DEFAULT 'TEAM',
  current_question_index INTEGER NOT NULL DEFAULT 0,
  result_delay_seconds INTEGER NOT NULL DEFAULT 6,
  paused INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  config TEXT NOT NULL,
  time_limit INTEGER NOT NULL,
  points INTEGER NOT NULL,
  order_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES catchup_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catchup_sessions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'LOBBY',
  current_question_index INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  team_id TEXT,
  name TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  connected INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  correct INTEGER NOT NULL,
  score INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bingo_items (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  order_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bingo_cards (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  cell_item_ids TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bingo_calls (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  called_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_game ON questions(game_id);
CREATE INDEX IF NOT EXISTS idx_teams_game ON teams(game_id);
CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_catchup_sessions_game ON catchup_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_bingo_items_game ON bingo_items(game_id);
CREATE INDEX IF NOT EXISTS idx_bingo_cards_game ON bingo_cards(game_id);
CREATE INDEX IF NOT EXISTS idx_bingo_calls_game ON bingo_calls(game_id);
`)

// Additive migration for databases created before `mode` existed on `games`.
const gameColumns = db.prepare('PRAGMA table_info(games)').all() as { name: string }[]
if (!gameColumns.some((c) => c.name === 'mode')) {
  db.exec("ALTER TABLE games ADD COLUMN mode TEXT NOT NULL DEFAULT 'TEAM'")
}

// Additive migration for databases created before `game_type`/`bingo_config` existed on `games`.
if (!gameColumns.some((c) => c.name === 'game_type')) {
  db.exec("ALTER TABLE games ADD COLUMN game_type TEXT NOT NULL DEFAULT 'QUIZ'")
}
if (!gameColumns.some((c) => c.name === 'bingo_config')) {
  db.exec('ALTER TABLE games ADD COLUMN bingo_config TEXT')
}

// Additive migration for databases created before `session_id` existed on `teams`.
const teamColumns = db.prepare('PRAGMA table_info(teams)').all() as { name: string }[]
if (!teamColumns.some((c) => c.name === 'session_id')) {
  db.exec('ALTER TABLE teams ADD COLUMN session_id TEXT REFERENCES catchup_sessions(id) ON DELETE CASCADE')
}

export default db
