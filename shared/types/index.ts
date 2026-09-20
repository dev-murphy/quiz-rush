// ============================================================================
// Core domain types shared between client (Nuxt app) and server (Nitro).
// ============================================================================

export type QuestionType =
  | 'quiz'
  | 'true_false'
  | 'type_answer'
  | 'slider'
  | 'pin_answer'
  | 'puzzle'
  | 'fill_blank'
  | 'complete_text'

export interface QuizConfig {
  choices: string[] // 2-4 options
  correctIndex: number
}

export interface TrueFalseConfig {
  correctAnswer: boolean
}

export interface TypeAnswerConfig {
  correctAnswer: string
  acceptableAnswers?: string[]
}

export interface SliderConfig {
  min: number
  max: number
  correctValue: number
  tolerance: number
  step?: number
}

export interface PinAnswerConfig {
  imageUrl: string
  correctX: number // normalized 0..1 relative to image width
  correctY: number // normalized 0..1 relative to image height
  radius: number // normalized 0..1, tolerance radius relative to image width
}

export interface PuzzleConfig {
  items: string[] // canonical/correct order of the items
}

export interface FillBlankConfig {
  template: string // e.g. "The Lord is my {blank}; I shall not {blank}." — see shared/utils/fillBlank.ts
  answers: string[] // correct word per blank, in order
  wordBank: string[] // must contain enough copies to fill every blank, plus optional distractors
}

export interface CompleteTextConfig {
  answer: string // full literal sentence, e.g. "The Lord is my shepherd; I shall not want."
  wordBank: string[] // plain word tokens (no punctuation); must cover every token in `answer`, plus optional distractors
}

export type QuestionConfig =
  | QuizConfig
  | TrueFalseConfig
  | TypeAnswerConfig
  | SliderConfig
  | PinAnswerConfig
  | PuzzleConfig
  | FillBlankConfig
  | CompleteTextConfig

export interface Question {
  id: string
  gameId: string
  type: QuestionType
  text: string
  config: QuestionConfig
  timeLimit: number // seconds
  points: number
  order: number
}

/** Question shape sent to players — correct-answer fields stripped. */
export type PublicQuestion = Omit<Question, 'config'> & {
  config: Record<string, unknown>
}

export type GameStatus =
  | 'DRAFT'
  | 'LOBBY'
  | 'ACTIVE'
  | 'QUESTION_ACTIVE'
  | 'QUESTION_RESULTS'
  | 'FINISHED'
  | 'CANCELLED'

export type GameMode = 'TEAM' | 'INDIVIDUAL'

export type GameType = 'QUIZ' | 'BINGO'

export interface BingoConfig {
  gridSize: number // e.g. 5 for a 5x5 card
  freeSpace: boolean // free space in the center cell
  winPattern: 'LINE' | 'BLACKOUT'
  winPoints: number
}

export interface Game {
  id: string
  title: string
  pin: string | null
  status: GameStatus
  mode: GameMode
  gameType: GameType
  bingoConfig: BingoConfig | null
  currentQuestionIndex: number
  resultDelaySeconds: number
  paused: boolean
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

export interface BingoItem {
  id: string
  gameId: string
  text: string
  order: number
}

/** One cell of a player's assigned card. */
export interface BingoCardCell {
  itemId: string
  text: string
  isFree: boolean
}

export interface Team {
  id: string
  gameId: string
  /** Null for a main-session team; set to a catch-up session id for a team formed within that session. */
  sessionId: string | null
  name: string
  color: string
  score: number
}

export interface Player {
  id: string
  gameId: string
  teamId: string | null
  name: string
  connected: boolean
  joinedAt: number
}

export interface AnswerRecord {
  id: string
  questionId: string
  playerId: string
  teamId: string
  answer: unknown
  correct: boolean
  score: number
  submittedAt: number
}

export const TEAM_COLORS: { name: string; value: string }[] = [
  { name: 'Red', value: '#EF4444' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Yellow', value: '#EAB308' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Purple', value: '#A855F7' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Teal', value: '#14B8A6' }
]

export const QUIZ_ANSWER_COLORS = ['#EF4444', '#3B82F6', '#EAB308', '#22C55E']
export const QUIZ_ANSWER_SHAPES = ['triangle', 'diamond', 'circle', 'square'] as const

/**
 * A second, independent play-through of the same game's questions, for
 * players who join after the main session has moved on (or finished).
 * It reuses the game's questions and scoring; any teams it creates are
 * ordinary `teams` rows (tagged with this session's id), so their scores
 * are automatically included in the game's normal leaderboard.
 */
export type CatchupStatus = 'LOBBY' | 'QUESTION_ACTIVE' | 'QUESTION_RESULTS' | 'FINISHED'

export interface CatchupSession {
  id: string
  gameId: string
  status: CatchupStatus
  currentQuestionIndex: number
  createdAt: number
  finishedAt: number | null
}

export interface CatchupSyncPayload {
  /** Null when no catch-up session exists (or the last one finished and was dismissed). */
  session: CatchupSession | null
  teams: Team[]
  players: Player[]
  totalQuestions: number
  currentQuestion: QuestionStartedPayload | null
  lastResults: QuestionEndedPayload | null
}

export interface LeaderboardEntry {
  teamId: string
  name: string
  color: string
  score: number
  rank: number
  previousRank: number | null
}

export interface TeamQuestionResult {
  teamId: string
  teamName: string
  color: string
  correct: boolean
  answered: boolean
  scoreAwarded: number
  totalScore: number
}

// ============================================================================
// WebSocket protocol
// ============================================================================

export interface QuestionStartedPayload {
  question: PublicQuestion
  index: number
  total: number
  startedAt: number
  endsAt: number
}

export interface QuestionEndedPayload {
  question: PublicQuestion
  correctAnswer: unknown
  teamResults: TeamQuestionResult[]
  leaderboard: LeaderboardEntry[]
  isLastQuestion: boolean
  nextStartsAt: number | null
}

export interface SelfState {
  player: Player
  team: Team | null
}

export interface FullSyncState {
  game: Game
  teams: Team[]
  players: Player[]
  self: SelfState | null
  totalQuestions: number
  currentQuestion: QuestionStartedPayload | null
  lastResults: QuestionEndedPayload | null
  leaderboard: LeaderboardEntry[]
  myAnswerLocked: boolean
  myTeamLocked: boolean
  lockedTeamIds: string[]
  /** Bingo-only fields; empty/null for quiz games. */
  bingoCard: BingoCardCell[] | null
  bingoCalledItems: BingoCalledItem[]
  bingoItemsRemaining: number
}

export interface BingoCalledItem {
  itemId: string
  text: string
}

export interface BingoWinner {
  playerId: string
  playerName: string
  teamId: string | null
  pattern: 'LINE' | 'BLACKOUT'
}

export type ServerMessage =
  | { type: 'STATE_SYNC'; state: FullSyncState }
  | { type: 'PLAYER_JOINED'; player: Player }
  | { type: 'PLAYER_LEFT'; playerId: string }
  | { type: 'PLAYER_UPDATED'; player: Player }
  | { type: 'TEAM_UPDATED'; team: Team }
  | { type: 'TEAM_CREATED'; team: Team }
  | { type: 'TEAM_DELETED'; teamId: string }
  | { type: 'GAME_STARTED'; startedAt: number }
  | { type: 'QUESTION_STARTED'; payload: QuestionStartedPayload }
  | {
      type: 'ANSWER_ACK'
      correct: boolean
      locked: boolean
      message: string
      scoreAwarded?: number
    }
  | { type: 'TEAM_ANSWERED'; teamId: string; correct: boolean; answeredByName?: string }
  | { type: 'QUESTION_ENDED'; payload: QuestionEndedPayload }
  | { type: 'GAME_PAUSED' }
  | { type: 'GAME_RESUMED' }
  | { type: 'GAME_FINISHED'; leaderboard: LeaderboardEntry[]; winner?: BingoWinner }
  | { type: 'GAME_CANCELLED'; message: string }
  | { type: 'KICKED'; message: string }
  | { type: 'ERROR'; message: string }
  | { type: 'PONG' }
  | { type: 'CATCHUP_SYNC'; payload: CatchupSyncPayload }
  | { type: 'BINGO_CARD_ASSIGNED'; cells: BingoCardCell[] }
  | { type: 'BINGO_ITEM_CALLED'; itemId: string; text: string; calledItems: BingoCalledItem[]; remaining: number }
  | { type: 'BINGO_CLAIM_REJECTED'; message: string }

export type ClientMessage =
  | { type: 'ANSWER_SUBMIT'; questionId: string; answer: unknown }
  | { type: 'PING' }
  | { type: 'BINGO_CLAIM' }
