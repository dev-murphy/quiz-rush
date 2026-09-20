import { randomUUID } from 'node:crypto'
import { db } from './db'
import type {
  AnswerRecord,
  BingoConfig,
  BingoItem,
  CatchupSession,
  CatchupStatus,
  Game,
  GameMode,
  GameStatus,
  GameType,
  Player,
  Question,
  QuestionConfig,
  QuestionType,
  Team
} from '#shared/types'

// ---------------------------------------------------------------------------
// Row <-> domain mapping
// ---------------------------------------------------------------------------

interface GameRow {
  id: string
  title: string
  pin: string | null
  status: string
  mode: string
  game_type: string
  bingo_config: string | null
  current_question_index: number
  result_delay_seconds: number
  paused: number
  created_at: number
  started_at: number | null
  finished_at: number | null
}

const DEFAULT_BINGO_CONFIG: BingoConfig = { gridSize: 5, freeSpace: true, winPattern: 'LINE', winPoints: 1000 }

function mapGame(row: GameRow): Game {
  return {
    id: row.id,
    title: row.title,
    pin: row.pin,
    status: row.status as GameStatus,
    mode: row.mode as GameMode,
    gameType: row.game_type as GameType,
    bingoConfig: row.bingo_config ? (JSON.parse(row.bingo_config) as BingoConfig) : null,
    currentQuestionIndex: row.current_question_index,
    resultDelaySeconds: row.result_delay_seconds,
    paused: !!row.paused,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at
  }
}

interface QuestionRow {
  id: string
  game_id: string
  type: string
  text: string
  config: string
  time_limit: number
  points: number
  order_index: number
}

function mapQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    gameId: row.game_id,
    type: row.type as QuestionType,
    text: row.text,
    config: JSON.parse(row.config) as QuestionConfig,
    timeLimit: row.time_limit,
    points: row.points,
    order: row.order_index
  }
}

interface TeamRow {
  id: string
  game_id: string
  session_id: string | null
  name: string
  color: string
  score: number
}

function mapTeam(row: TeamRow): Team {
  return {
    id: row.id,
    gameId: row.game_id,
    sessionId: row.session_id,
    name: row.name,
    color: row.color,
    score: row.score
  }
}

interface CatchupSessionRow {
  id: string
  game_id: string
  status: string
  current_question_index: number
  created_at: number
  finished_at: number | null
}

function mapCatchupSession(row: CatchupSessionRow): CatchupSession {
  return {
    id: row.id,
    gameId: row.game_id,
    status: row.status as CatchupStatus,
    currentQuestionIndex: row.current_question_index,
    createdAt: row.created_at,
    finishedAt: row.finished_at
  }
}

interface PlayerRow {
  id: string
  game_id: string
  team_id: string | null
  name: string
  session_token: string
  connected: number
  joined_at: number
}

function mapPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    gameId: row.game_id,
    teamId: row.team_id,
    name: row.name,
    connected: !!row.connected,
    joinedAt: row.joined_at
  }
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

export function createGame(title: string, mode: GameMode = 'TEAM', gameType: GameType = 'QUIZ'): Game {
  const id = randomUUID()
  const now = Date.now()
  const bingoConfig = gameType === 'BINGO' ? JSON.stringify(DEFAULT_BINGO_CONFIG) : null
  db.prepare(
    `INSERT INTO games (id, title, pin, status, mode, game_type, bingo_config, current_question_index, result_delay_seconds, paused, created_at, started_at, finished_at)
     VALUES (?, ?, NULL, 'DRAFT', ?, ?, ?, 0, 6, 0, ?, NULL, NULL)`
  ).run(id, title, mode, gameType, bingoConfig, now)
  return getGame(id)!
}

export function getGame(id: string): Game | null {
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(id) as GameRow | undefined
  return row ? mapGame(row) : null
}

export function getGameByPin(pin: string): Game | null {
  const row = db.prepare('SELECT * FROM games WHERE pin = ?').get(pin) as GameRow | undefined
  return row ? mapGame(row) : null
}

export function listGames(): Game[] {
  const rows = db.prepare('SELECT * FROM games ORDER BY created_at DESC').all() as GameRow[]
  return rows.map(mapGame)
}

export function updateGameTitle(id: string, title: string): void {
  db.prepare('UPDATE games SET title = ? WHERE id = ?').run(title, id)
}

export function updateGameStatus(id: string, status: GameStatus): void {
  db.prepare('UPDATE games SET status = ? WHERE id = ?').run(status, id)
}

export function setGamePin(id: string, pin: string): void {
  db.prepare('UPDATE games SET pin = ? WHERE id = ?').run(pin, id)
}

export function setGameStarted(id: string): void {
  db.prepare("UPDATE games SET status = 'ACTIVE', started_at = ? WHERE id = ?").run(Date.now(), id)
}

export function setGameFinished(id: string): void {
  db.prepare("UPDATE games SET status = 'FINISHED', finished_at = ? WHERE id = ?").run(Date.now(), id)
}

export function resetGameForRestart(id: string): void {
  db.prepare(
    "UPDATE games SET status = 'LOBBY', current_question_index = 0, paused = 0, started_at = NULL, finished_at = NULL WHERE id = ?"
  ).run(id)
}

export function setGamePaused(id: string, paused: boolean): void {
  db.prepare('UPDATE games SET paused = ? WHERE id = ?').run(paused ? 1 : 0, id)
}

export function setCurrentQuestionIndex(id: string, index: number): void {
  db.prepare('UPDATE games SET current_question_index = ? WHERE id = ?').run(index, id)
}

export function deleteGame(id: string): void {
  db.prepare('DELETE FROM games WHERE id = ?').run(id)
}

export function pinExists(pin: string): boolean {
  const row = db.prepare('SELECT 1 FROM games WHERE pin = ?').get(pin)
  return !!row
}

export function gameIdExists(id: string): boolean {
  const row = db.prepare('SELECT 1 FROM games WHERE id = ?').get(id)
  return !!row
}

/** Re-inserts a previously-exported game as-is (same id), used by full-data import/restore. */
export function restoreGame(game: Game, pin: string | null): void {
  db.prepare(
    `INSERT INTO games (id, title, pin, status, mode, game_type, bingo_config, current_question_index, result_delay_seconds, paused, created_at, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    game.id,
    game.title,
    pin,
    game.status,
    game.mode,
    game.gameType,
    game.bingoConfig ? JSON.stringify(game.bingoConfig) : null,
    game.currentQuestionIndex,
    game.resultDelaySeconds,
    game.paused ? 1 : 0,
    game.createdAt,
    game.startedAt,
    game.finishedAt
  )
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export function listQuestions(gameId: string): Question[] {
  const rows = db
    .prepare('SELECT * FROM questions WHERE game_id = ? ORDER BY order_index ASC')
    .all(gameId) as QuestionRow[]
  return rows.map(mapQuestion)
}

export function getQuestion(id: string): Question | null {
  const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as QuestionRow | undefined
  return row ? mapQuestion(row) : null
}

export function createQuestion(input: Omit<Question, 'id'>): Question {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO questions (id, game_id, type, text, config, time_limit, points, order_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.gameId,
    input.type,
    input.text,
    JSON.stringify(input.config),
    input.timeLimit,
    input.points,
    input.order
  )
  return getQuestion(id)!
}

export function createQuestions(
  gameId: string,
  startOrder: number,
  inputs: Array<Omit<Question, 'id' | 'gameId' | 'order'>>
): Question[] {
  const ids = inputs.map(() => randomUUID())
  const insert = db.prepare(
    `INSERT INTO questions (id, game_id, type, text, config, time_limit, points, order_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const tx = db.transaction((rows: Array<{ id: string; input: Omit<Question, 'id' | 'gameId' | 'order'> }>) => {
    rows.forEach(({ id, input }, idx) => {
      insert.run(
        id,
        gameId,
        input.type,
        input.text,
        JSON.stringify(input.config),
        input.timeLimit,
        input.points,
        startOrder + idx
      )
    })
  })
  tx(inputs.map((input, i) => ({ id: ids[i]!, input })))
  return ids.map((id) => getQuestion(id)!)
}

export function updateQuestion(id: string, input: Omit<Question, 'id' | 'gameId'>): void {
  db.prepare(
    `UPDATE questions SET type = ?, text = ?, config = ?, time_limit = ?, points = ?, order_index = ? WHERE id = ?`
  ).run(input.type, input.text, JSON.stringify(input.config), input.timeLimit, input.points, input.order, id)
}

export function deleteQuestion(id: string): void {
  db.prepare('DELETE FROM questions WHERE id = ?').run(id)
}

export function deleteQuestions(ids: string[]): void {
  const stmt = db.prepare('DELETE FROM questions WHERE id = ?')
  const tx = db.transaction((idList: string[]) => {
    idList.forEach((id) => stmt.run(id))
  })
  tx(ids)
}

/** Re-inserts previously-exported questions as-is (same ids), used by full-data import/restore. */
export function restoreQuestions(questions: Question[]): void {
  const insert = db.prepare(
    `INSERT INTO questions (id, game_id, type, text, config, time_limit, points, order_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const tx = db.transaction((rows: Question[]) => {
    rows.forEach((q) => {
      insert.run(q.id, q.gameId, q.type, q.text, JSON.stringify(q.config), q.timeLimit, q.points, q.order)
    })
  })
  tx(questions)
}

export function reorderQuestions(gameId: string, orderedIds: string[]): void {
  const stmt = db.prepare('UPDATE questions SET order_index = ? WHERE id = ? AND game_id = ?')
  const tx = db.transaction((ids: string[]) => {
    ids.forEach((qid, idx) => stmt.run(idx, qid, gameId))
  })
  tx(orderedIds)
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export function listTeams(gameId: string): Team[] {
  const rows = db.prepare('SELECT * FROM teams WHERE game_id = ? ORDER BY rowid ASC').all(gameId) as TeamRow[]
  return rows.map(mapTeam)
}

/** Main-session teams only (excludes teams formed within a catch-up session). */
export function listMainTeams(gameId: string): Team[] {
  const rows = db
    .prepare('SELECT * FROM teams WHERE game_id = ? AND session_id IS NULL ORDER BY rowid ASC')
    .all(gameId) as TeamRow[]
  return rows.map(mapTeam)
}

export function listTeamsForSession(sessionId: string): Team[] {
  const rows = db.prepare('SELECT * FROM teams WHERE session_id = ? ORDER BY rowid ASC').all(sessionId) as TeamRow[]
  return rows.map(mapTeam)
}

export function getTeam(id: string): Team | null {
  const row = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as TeamRow | undefined
  return row ? mapTeam(row) : null
}

export function createTeam(gameId: string, name: string, color: string, sessionId: string | null = null): Team {
  const id = randomUUID()
  db.prepare('INSERT INTO teams (id, game_id, session_id, name, color, score) VALUES (?, ?, ?, ?, ?, 0)').run(
    id,
    gameId,
    sessionId,
    name,
    color
  )
  return getTeam(id)!
}

/** Re-inserts previously-exported teams as-is (same ids, preserving score), used by full-data import/restore. */
export function restoreTeams(teams: Team[]): void {
  const insert = db.prepare('INSERT INTO teams (id, game_id, name, color, score) VALUES (?, ?, ?, ?, ?)')
  const tx = db.transaction((rows: Team[]) => {
    rows.forEach((t) => insert.run(t.id, t.gameId, t.name, t.color, t.score))
  })
  tx(teams)
}

export function updateTeam(id: string, fields: { name?: string; color?: string }): void {
  const current = getTeam(id)
  if (!current) return
  const name = fields.name ?? current.name
  const color = fields.color ?? current.color
  db.prepare('UPDATE teams SET name = ?, color = ? WHERE id = ?').run(name, color, id)
}

export function incrementTeamScore(id: string, delta: number): void {
  db.prepare('UPDATE teams SET score = MAX(0, score + ?) WHERE id = ?').run(delta, id)
}

export function resetTeamScores(gameId: string): void {
  db.prepare('UPDATE teams SET score = 0 WHERE game_id = ?').run(gameId)
}

export function deleteTeam(id: string): void {
  db.prepare('UPDATE players SET team_id = NULL WHERE team_id = ?').run(id)
  db.prepare('DELETE FROM teams WHERE id = ?').run(id)
}

// ---------------------------------------------------------------------------
// Catch-up sessions
// ---------------------------------------------------------------------------

export function createCatchupSession(gameId: string): CatchupSession {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO catchup_sessions (id, game_id, status, current_question_index, created_at, finished_at)
     VALUES (?, ?, 'LOBBY', 0, ?, NULL)`
  ).run(id, gameId, Date.now())
  return getCatchupSession(id)!
}

export function getCatchupSession(id: string): CatchupSession | null {
  const row = db.prepare('SELECT * FROM catchup_sessions WHERE id = ?').get(id) as CatchupSessionRow | undefined
  return row ? mapCatchupSession(row) : null
}

/** The game's current non-finished catch-up session, if any (only one is allowed at a time). */
export function getActiveCatchupSession(gameId: string): CatchupSession | null {
  const row = db
    .prepare("SELECT * FROM catchup_sessions WHERE game_id = ? AND status != 'FINISHED' ORDER BY created_at DESC LIMIT 1")
    .get(gameId) as CatchupSessionRow | undefined
  return row ? mapCatchupSession(row) : null
}

export function updateCatchupStatus(id: string, status: CatchupStatus): void {
  db.prepare('UPDATE catchup_sessions SET status = ? WHERE id = ?').run(status, id)
}

export function setCatchupQuestionIndex(id: string, index: number): void {
  db.prepare('UPDATE catchup_sessions SET current_question_index = ? WHERE id = ?').run(index, id)
}

export function markCatchupSessionFinished(id: string): void {
  db.prepare("UPDATE catchup_sessions SET status = 'FINISHED', finished_at = ? WHERE id = ?").run(Date.now(), id)
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export function listPlayers(gameId: string): Player[] {
  const rows = db.prepare('SELECT * FROM players WHERE game_id = ? ORDER BY joined_at ASC').all(gameId) as PlayerRow[]
  return rows.map(mapPlayer)
}

/** Main-session players only — those with no team, or a team not scoped to a catch-up session. */
export function listMainPlayers(gameId: string): Player[] {
  const rows = db
    .prepare(
      `SELECT players.* FROM players
       LEFT JOIN teams ON teams.id = players.team_id
       WHERE players.game_id = ? AND teams.session_id IS NULL
       ORDER BY players.joined_at ASC`
    )
    .all(gameId) as PlayerRow[]
  return rows.map(mapPlayer)
}

export function listPlayersForSession(sessionId: string): Player[] {
  const rows = db
    .prepare(
      `SELECT players.* FROM players
       JOIN teams ON teams.id = players.team_id
       WHERE teams.session_id = ?
       ORDER BY players.joined_at ASC`
    )
    .all(sessionId) as PlayerRow[]
  return rows.map(mapPlayer)
}

export function getPlayer(id: string): Player | null {
  const row = db.prepare('SELECT * FROM players WHERE id = ?').get(id) as PlayerRow | undefined
  return row ? mapPlayer(row) : null
}

export function getPlayerByToken(token: string): Player | null {
  const row = db.prepare('SELECT * FROM players WHERE session_token = ?').get(token) as PlayerRow | undefined
  return row ? mapPlayer(row) : null
}

export function findPlayerByNameInGame(gameId: string, name: string): Player | null {
  const row = db
    .prepare('SELECT * FROM players WHERE game_id = ? AND LOWER(name) = LOWER(?)')
    .get(gameId, name) as PlayerRow | undefined
  return row ? mapPlayer(row) : null
}

export function createPlayer(gameId: string, name: string, teamId: string | null): { player: Player; token: string } {
  const id = randomUUID()
  const token = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO players (id, game_id, team_id, name, session_token, connected, joined_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).run(id, gameId, teamId, name, token, now)
  return { player: getPlayer(id)!, token }
}

/** Re-inserts previously-exported players as-is (same ids, fresh session tokens), used by full-data import/restore. */
export function restorePlayers(players: Player[]): void {
  const insert = db.prepare(
    `INSERT INTO players (id, game_id, team_id, name, session_token, connected, joined_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  )
  const tx = db.transaction((rows: Player[]) => {
    rows.forEach((p) => insert.run(p.id, p.gameId, p.teamId, p.name, randomUUID(), p.joinedAt))
  })
  tx(players)
}

export function setPlayerTeam(id: string, teamId: string | null): void {
  db.prepare('UPDATE players SET team_id = ? WHERE id = ?').run(teamId, id)
}

export function setPlayerConnected(id: string, connected: boolean): void {
  db.prepare('UPDATE players SET connected = ? WHERE id = ?').run(connected ? 1 : 0, id)
}

export function deletePlayer(id: string): void {
  db.prepare('DELETE FROM players WHERE id = ?').run(id)
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export function createAnswer(input: Omit<AnswerRecord, 'id'>): AnswerRecord {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO answers (id, question_id, player_id, team_id, answer, correct, score, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.questionId,
    input.playerId,
    input.teamId,
    JSON.stringify(input.answer),
    input.correct ? 1 : 0,
    input.score,
    input.submittedAt
  )
  return { ...input, id }
}

/** Re-inserts previously-exported answers as-is (same ids), used by full-data import/restore. */
export function restoreAnswers(answers: AnswerRecord[]): void {
  const insert = db.prepare(
    `INSERT INTO answers (id, question_id, player_id, team_id, answer, correct, score, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const tx = db.transaction((rows: AnswerRecord[]) => {
    rows.forEach((a) => {
      insert.run(a.id, a.questionId, a.playerId, a.teamId, JSON.stringify(a.answer), a.correct ? 1 : 0, a.score, a.submittedAt)
    })
  })
  tx(answers)
}

interface AnswerRow {
  id: string
  question_id: string
  player_id: string
  team_id: string
  answer: string
  correct: number
  score: number
  submitted_at: number
}

function mapAnswer(r: AnswerRow): AnswerRecord {
  return {
    id: r.id,
    questionId: r.question_id,
    playerId: r.player_id,
    teamId: r.team_id,
    answer: JSON.parse(r.answer),
    correct: !!r.correct,
    score: r.score,
    submittedAt: r.submitted_at
  }
}

export function getAnswersForQuestion(questionId: string): AnswerRecord[] {
  const rows = db.prepare('SELECT * FROM answers WHERE question_id = ?').all(questionId) as AnswerRow[]
  return rows.map(mapAnswer)
}

export function getAnswersForGame(gameId: string): AnswerRecord[] {
  const rows = db
    .prepare(
      `SELECT answers.* FROM answers
       JOIN questions ON questions.id = answers.question_id
       WHERE questions.game_id = ?
       ORDER BY answers.submitted_at ASC`
    )
    .all(gameId) as AnswerRow[]
  return rows.map(mapAnswer)
}

export function deleteAnswersForQuestion(questionId: string): void {
  db.prepare('DELETE FROM answers WHERE question_id = ?').run(questionId)
}

export function deleteAnswersForGame(gameId: string): void {
  db.prepare('DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE game_id = ?)').run(gameId)
}

export function hasTeamAnsweredCorrectly(questionId: string, teamId: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM answers WHERE question_id = ? AND team_id = ? AND correct = 1')
    .get(questionId, teamId)
  return !!row
}

// ---------------------------------------------------------------------------
// Bingo
// ---------------------------------------------------------------------------

interface BingoItemRow {
  id: string
  game_id: string
  text: string
  order_index: number
}

function mapBingoItem(row: BingoItemRow): BingoItem {
  return { id: row.id, gameId: row.game_id, text: row.text, order: row.order_index }
}

export function listBingoItems(gameId: string): BingoItem[] {
  const rows = db
    .prepare('SELECT * FROM bingo_items WHERE game_id = ? ORDER BY order_index ASC')
    .all(gameId) as BingoItemRow[]
  return rows.map(mapBingoItem)
}

export function countBingoItems(gameId: string): number {
  const row = db.prepare('SELECT COUNT(*) as n FROM bingo_items WHERE game_id = ?').get(gameId) as { n: number }
  return row.n
}

export function createBingoItems(gameId: string, texts: string[]): BingoItem[] {
  const startOrder = countBingoItems(gameId)
  const ids = texts.map(() => randomUUID())
  const insert = db.prepare('INSERT INTO bingo_items (id, game_id, text, order_index) VALUES (?, ?, ?, ?)')
  const tx = db.transaction((rows: Array<{ id: string; text: string }>) => {
    rows.forEach(({ id, text }, idx) => insert.run(id, gameId, text, startOrder + idx))
  })
  tx(texts.map((text, i) => ({ id: ids[i]!, text })))
  return ids.map((id) => mapBingoItem(db.prepare('SELECT * FROM bingo_items WHERE id = ?').get(id) as BingoItemRow))
}

export function deleteBingoItem(id: string): void {
  db.prepare('DELETE FROM bingo_items WHERE id = ?').run(id)
}

/** Re-inserts previously-exported bingo items as-is (same ids), used by full-data import/restore. */
export function restoreBingoItems(items: BingoItem[]): void {
  const insert = db.prepare('INSERT INTO bingo_items (id, game_id, text, order_index) VALUES (?, ?, ?, ?)')
  const tx = db.transaction((rows: BingoItem[]) => {
    rows.forEach((i) => insert.run(i.id, i.gameId, i.text, i.order))
  })
  tx(items)
}

export function updateBingoConfig(gameId: string, config: BingoConfig): void {
  db.prepare('UPDATE games SET bingo_config = ? WHERE id = ?').run(JSON.stringify(config), gameId)
}

export interface BingoCard {
  id: string
  gameId: string
  playerId: string
  cellItemIds: string[]
  createdAt: number
}

interface BingoCardRow {
  id: string
  game_id: string
  player_id: string
  cell_item_ids: string
  created_at: number
}

function mapBingoCard(row: BingoCardRow): BingoCard {
  return {
    id: row.id,
    gameId: row.game_id,
    playerId: row.player_id,
    cellItemIds: JSON.parse(row.cell_item_ids) as string[],
    createdAt: row.created_at
  }
}

export function createBingoCard(gameId: string, playerId: string, cellItemIds: string[]): BingoCard {
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    'INSERT INTO bingo_cards (id, game_id, player_id, cell_item_ids, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, gameId, playerId, JSON.stringify(cellItemIds), now)
  return { id, gameId, playerId, cellItemIds, createdAt: now }
}

export function getBingoCardForPlayer(playerId: string): BingoCard | null {
  const row = db.prepare('SELECT * FROM bingo_cards WHERE player_id = ?').get(playerId) as BingoCardRow | undefined
  return row ? mapBingoCard(row) : null
}

export function listBingoCardsForGame(gameId: string): BingoCard[] {
  const rows = db.prepare('SELECT * FROM bingo_cards WHERE game_id = ?').all(gameId) as BingoCardRow[]
  return rows.map(mapBingoCard)
}

/** Re-inserts previously-exported bingo cards as-is (same ids), used by full-data import/restore. */
export function restoreBingoCards(cards: BingoCard[]): void {
  const insert = db.prepare(
    'INSERT INTO bingo_cards (id, game_id, player_id, cell_item_ids, created_at) VALUES (?, ?, ?, ?, ?)'
  )
  const tx = db.transaction((rows: BingoCard[]) => {
    rows.forEach((c) => insert.run(c.id, c.gameId, c.playerId, JSON.stringify(c.cellItemIds), c.createdAt))
  })
  tx(cards)
}

export interface BingoCall {
  id: string
  gameId: string
  itemId: string
  order: number
  calledAt: number
}

interface BingoCallRow {
  id: string
  game_id: string
  item_id: string
  order_index: number
  called_at: number
}

function mapBingoCall(row: BingoCallRow): BingoCall {
  return { id: row.id, gameId: row.game_id, itemId: row.item_id, order: row.order_index, calledAt: row.called_at }
}

export function createBingoCall(gameId: string, itemId: string, order: number): BingoCall {
  const id = randomUUID()
  const now = Date.now()
  db.prepare('INSERT INTO bingo_calls (id, game_id, item_id, order_index, called_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    gameId,
    itemId,
    order,
    now
  )
  return { id, gameId, itemId, order, calledAt: now }
}

export function listBingoCalls(gameId: string): BingoCall[] {
  const rows = db
    .prepare('SELECT * FROM bingo_calls WHERE game_id = ? ORDER BY order_index ASC')
    .all(gameId) as BingoCallRow[]
  return rows.map(mapBingoCall)
}

/** Re-inserts previously-exported bingo calls as-is (same ids), used by full-data import/restore. */
export function restoreBingoCalls(calls: BingoCall[]): void {
  const insert = db.prepare(
    'INSERT INTO bingo_calls (id, game_id, item_id, order_index, called_at) VALUES (?, ?, ?, ?, ?)'
  )
  const tx = db.transaction((rows: BingoCall[]) => {
    rows.forEach((c) => insert.run(c.id, c.gameId, c.itemId, c.order, c.calledAt))
  })
  tx(calls)
}

/** Clears a bingo game's in-progress state (cards + call log) while keeping the item pool and config, for restart. */
export function clearBingoRuntimeForRestart(gameId: string): void {
  db.prepare('DELETE FROM bingo_cards WHERE game_id = ?').run(gameId)
  db.prepare('DELETE FROM bingo_calls WHERE game_id = ?').run(gameId)
}

// ---------------------------------------------------------------------------
// Sessions (Game Master auth)
// ---------------------------------------------------------------------------

export function createSession(): string {
  const token = randomUUID()
  db.prepare('INSERT INTO sessions (token, created_at) VALUES (?, ?)').run(token, Date.now())
  return token
}

export function isValidSession(token: string | undefined | null): boolean {
  if (!token) return false
  const row = db.prepare('SELECT 1 FROM sessions WHERE token = ?').get(token)
  return !!row
}

export function deleteSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}
