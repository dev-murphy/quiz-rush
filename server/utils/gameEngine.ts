import type {
  FullSyncState,
  Game,
  Player,
  QuestionEndedPayload,
  QuestionStartedPayload,
  Team,
  TeamQuestionResult
} from '#shared/types'
import * as catchupEngine from './catchupEngine'
import { computeLeaderboard } from './leaderboard'
import { evaluateAnswer, getCorrectAnswerDisplay } from './scoring'
import { sanitizeQuestion } from './sanitize'
import * as repo from './repo'
import { broadcast, getPeersForGame, sendMessage, sendToPlayer } from './wsRegistry'

interface RuntimeState {
  gameId: string
  questionTimer: ReturnType<typeof setTimeout> | null
  resultTimer: ReturnType<typeof setTimeout> | null
  questionStartedAt: number | null
  questionEndsAt: number | null
  remainingMsWhenPaused: number | null
  lockedTeams: Set<string>
  currentPayload: QuestionStartedPayload | null
  lastResults: QuestionEndedPayload | null
  previousRanks: Map<string, number>
}

const runtimes = new Map<string, RuntimeState>()

function getRuntime(gameId: string): RuntimeState {
  let rt = runtimes.get(gameId)
  if (!rt) {
    rt = {
      gameId,
      questionTimer: null,
      resultTimer: null,
      questionStartedAt: null,
      questionEndsAt: null,
      remainingMsWhenPaused: null,
      lockedTeams: new Set(),
      currentPayload: null,
      lastResults: null,
      previousRanks: new Map()
    }
    runtimes.set(gameId, rt)
  }
  return rt
}

function clearTimers(rt: RuntimeState): void {
  if (rt.questionTimer) clearTimeout(rt.questionTimer)
  if (rt.resultTimer) clearTimeout(rt.resultTimer)
  rt.questionTimer = null
  rt.resultTimer = null
}

function generatePin(): string {
  let pin: string
  do {
    pin = String(Math.floor(100000 + Math.random() * 900000))
  } while (repo.pinExists(pin))
  return pin
}

/** Main-session teams with at least one player — used to detect "everyone answered" for the main question. */
function activeTeamIds(gameId: string): Set<string> {
  const players = repo.listMainPlayers(gameId)
  const withPlayers = new Set(players.filter((p) => p.teamId).map((p) => p.teamId as string))
  return withPlayers
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function launchGame(gameId: string): Game {
  const game = repo.getGame(gameId)
  if (!game) throw new Error('Game not found')
  if (game.status !== 'DRAFT' && game.status !== 'LOBBY') {
    throw new Error('Game already launched')
  }
  if (!game.pin) {
    repo.setGamePin(gameId, generatePin())
  }
  repo.updateGameStatus(gameId, 'LOBBY')
  return repo.getGame(gameId)!
}

export function startGame(gameId: string): void {
  const game = repo.getGame(gameId)
  if (!game) throw new Error('Game not found')
  if (game.status !== 'LOBBY') throw new Error('Game is not in lobby')
  const questions = repo.listQuestions(gameId)
  if (questions.length === 0) throw new Error('Game has no questions')

  repo.setGameStarted(gameId)
  broadcast(gameId, { type: 'GAME_STARTED', startedAt: Date.now() })
  startQuestion(gameId, 0)
}

export function startQuestion(gameId: string, index: number): void {
  const rt = getRuntime(gameId)
  clearTimers(rt)
  const questions = repo.listQuestions(gameId)

  if (index < 0 || index >= questions.length) {
    finishGame(gameId)
    return
  }

  const question = questions[index]!
  const now = Date.now()
  const endsAt = now + question.timeLimit * 1000

  repo.setCurrentQuestionIndex(gameId, index)
  repo.updateGameStatus(gameId, 'QUESTION_ACTIVE')
  repo.setGamePaused(gameId, false)

  rt.questionStartedAt = now
  rt.questionEndsAt = endsAt
  rt.remainingMsWhenPaused = null
  rt.lockedTeams = new Set()
  rt.lastResults = null

  const payload: QuestionStartedPayload = {
    question: sanitizeQuestion(question),
    index,
    total: questions.length,
    startedAt: now,
    endsAt
  }
  rt.currentPayload = payload

  broadcast(gameId, { type: 'QUESTION_STARTED', payload })

  rt.questionTimer = setTimeout(() => endQuestion(gameId), question.timeLimit * 1000)
}

export function submitAnswer(
  gameId: string,
  player: Player,
  questionId: string,
  answer: unknown
): void {
  const catchupSessionId = catchupEngine.getCatchupSessionIdForPlayer(player)
  if (catchupSessionId) {
    catchupEngine.submitCatchupAnswer(catchupSessionId, player, questionId, answer)
    return
  }

  const game = repo.getGame(gameId)
  const rt = getRuntime(gameId)

  if (!game || game.status !== 'QUESTION_ACTIVE' || game.paused) {
    sendToPlayer(gameId, player.id, {
      type: 'ANSWER_ACK',
      correct: false,
      locked: false,
      message: 'Question is not active.'
    })
    return
  }
  if (!rt.currentPayload || rt.currentPayload.question.id !== questionId) {
    sendToPlayer(gameId, player.id, {
      type: 'ANSWER_ACK',
      correct: false,
      locked: false,
      message: 'That question has ended.'
    })
    return
  }
  if (Date.now() > (rt.questionEndsAt ?? 0)) {
    sendToPlayer(gameId, player.id, {
      type: 'ANSWER_ACK',
      correct: false,
      locked: false,
      message: 'Time is up.'
    })
    return
  }
  if (!player.teamId) {
    sendToPlayer(gameId, player.id, {
      type: 'ANSWER_ACK',
      correct: false,
      locked: false,
      message: 'You are not on a team yet.'
    })
    return
  }
  if (rt.lockedTeams.has(player.teamId)) {
    sendToPlayer(gameId, player.id, {
      type: 'ANSWER_ACK',
      correct: true,
      locked: true,
      message: game.mode === 'INDIVIDUAL' ? 'You already answered this one!' : 'Your team already answered this one!'
    })
    return
  }

  const question = repo.getQuestion(questionId)
  if (!question) return

  const elapsedMs = Date.now() - (rt.questionStartedAt ?? Date.now())
  const { correct, score } = evaluateAnswer(question, answer, elapsedMs)

  repo.createAnswer({
    questionId,
    playerId: player.id,
    teamId: player.teamId,
    answer,
    correct,
    score,
    submittedAt: Date.now()
  })

  if (correct) {
    rt.lockedTeams.add(player.teamId)
    repo.incrementTeamScore(player.teamId, score)

    sendToPlayer(gameId, player.id, {
      type: 'ANSWER_ACK',
      correct: true,
      locked: true,
      message: game.mode === 'INDIVIDUAL' ? 'Correct!' : 'Correct! Your team got it!',
      scoreAwarded: score
    })
    broadcast(gameId, {
      type: 'TEAM_ANSWERED',
      teamId: player.teamId,
      correct: true,
      answeredByName: player.name
    })

    const active = activeTeamIds(gameId)
    const allLocked = active.size > 0 && [...active].every((t) => rt.lockedTeams.has(t))
    if (allLocked) {
      endQuestion(gameId)
    }
  } else {
    sendToPlayer(gameId, player.id, {
      type: 'ANSWER_ACK',
      correct: false,
      locked: false,
      message: 'Not quite — try again!'
    })
  }
}

export function endQuestion(gameId: string): void {
  const rt = getRuntime(gameId)
  clearTimers(rt)
  const game = repo.getGame(gameId)
  if (!game || !rt.currentPayload) return
  if (game.status !== 'QUESTION_ACTIVE') return

  const questions = repo.listQuestions(gameId)
  const question = questions.find((q) => q.id === rt.currentPayload!.question.id)
  if (!question) return

  const teams = repo.listMainTeams(gameId)
  const answers = repo.getAnswersForQuestion(question.id)

  const teamResults: TeamQuestionResult[] = teams.map((team) => {
    const teamAnswers = answers.filter((a) => a.teamId === team.id)
    const correctAnswer = teamAnswers.find((a) => a.correct)
    return {
      teamId: team.id,
      teamName: team.name,
      color: team.color,
      correct: !!correctAnswer,
      answered: teamAnswers.length > 0,
      scoreAwarded: correctAnswer?.score ?? 0,
      totalScore: repo.getTeam(team.id)?.score ?? team.score
    }
  })

  const leaderboard = computeLeaderboard(gameId, rt.previousRanks)
  rt.previousRanks = new Map(leaderboard.map((e) => [e.teamId, e.rank]))

  const isLastQuestion = question.order >= questions.length - 1
  const resultDelayMs = game.resultDelaySeconds * 1000
  const nextStartsAt = Date.now() + resultDelayMs

  const payload: QuestionEndedPayload = {
    question: rt.currentPayload.question,
    correctAnswer: getCorrectAnswerDisplay(question),
    teamResults,
    leaderboard,
    isLastQuestion,
    nextStartsAt
  }

  rt.lastResults = payload
  repo.updateGameStatus(gameId, 'QUESTION_RESULTS')
  broadcast(gameId, { type: 'QUESTION_ENDED', payload })

  const currentIndex = questions.findIndex((q) => q.id === question.id)
  rt.resultTimer = setTimeout(() => {
    if (isLastQuestion) {
      finishGame(gameId)
    } else {
      startQuestion(gameId, currentIndex + 1)
    }
  }, resultDelayMs)
}

export function finishGame(gameId: string): void {
  const rt = getRuntime(gameId)
  clearTimers(rt)
  repo.setGameFinished(gameId)
  const leaderboard = computeLeaderboard(gameId, rt.previousRanks)
  broadcast(gameId, { type: 'GAME_FINISHED', leaderboard })
}

// ---------------------------------------------------------------------------
// Game Master emergency controls
// ---------------------------------------------------------------------------

export function pauseGame(gameId: string): void {
  const game = repo.getGame(gameId)
  const rt = getRuntime(gameId)
  if (!game || game.status !== 'QUESTION_ACTIVE' || game.paused) return
  if (rt.questionTimer) clearTimeout(rt.questionTimer)
  rt.questionTimer = null
  rt.remainingMsWhenPaused = Math.max(0, (rt.questionEndsAt ?? Date.now()) - Date.now())
  repo.setGamePaused(gameId, true)
  broadcast(gameId, { type: 'GAME_PAUSED' })
}

export function resumeGame(gameId: string): void {
  const game = repo.getGame(gameId)
  const rt = getRuntime(gameId)
  if (!game || game.status !== 'QUESTION_ACTIVE' || !game.paused) return
  const remaining = rt.remainingMsWhenPaused ?? 0
  const now = Date.now()
  rt.questionEndsAt = now + remaining
  if (rt.currentPayload) {
    rt.currentPayload = { ...rt.currentPayload, startedAt: rt.questionStartedAt ?? now, endsAt: rt.questionEndsAt }
  }
  repo.setGamePaused(gameId, false)
  broadcast(gameId, { type: 'GAME_RESUMED' })
  if (rt.currentPayload) {
    broadcast(gameId, { type: 'QUESTION_STARTED', payload: rt.currentPayload })
  }
  rt.questionTimer = setTimeout(() => endQuestion(gameId), remaining)
}

export function skipQuestion(gameId: string): void {
  const game = repo.getGame(gameId)
  if (!game) return
  if (game.status === 'QUESTION_ACTIVE') {
    endQuestion(gameId)
  }
}

export function restartQuestion(gameId: string): void {
  const game = repo.getGame(gameId)
  const rt = getRuntime(gameId)
  if (!game) return
  if (game.status !== 'QUESTION_ACTIVE' && game.status !== 'QUESTION_RESULTS') return
  const questionId = rt.currentPayload?.question.id
  if (!questionId) return

  const answers = repo.getAnswersForQuestion(questionId)
  const scoreByTeam = new Map<string, number>()
  for (const a of answers) {
    if (a.correct) scoreByTeam.set(a.teamId, (scoreByTeam.get(a.teamId) ?? 0) + a.score)
  }
  for (const [teamId, score] of scoreByTeam) {
    repo.incrementTeamScore(teamId, -score)
  }
  repo.deleteAnswersForQuestion(questionId)

  const index = repo.getGame(gameId)!.currentQuestionIndex
  startQuestion(gameId, index)
}

export function endGameEarly(gameId: string): void {
  finishGame(gameId)
}

export function advanceToNextQuestion(gameId: string): void {
  const game = repo.getGame(gameId)
  const rt = getRuntime(gameId)
  if (!game || game.status !== 'QUESTION_RESULTS' || !rt.lastResults) return
  clearTimers(rt)
  if (rt.lastResults.isLastQuestion) {
    finishGame(gameId)
  } else {
    startQuestion(gameId, game.currentQuestionIndex + 1)
  }
}

export function restartGame(gameId: string): Game {
  const game = repo.getGame(gameId)
  if (!game) throw new Error('Game not found')
  if (game.status !== 'FINISHED') throw new Error('Only a finished game can be restarted')

  const rt = getRuntime(gameId)
  clearTimers(rt)
  rt.questionStartedAt = null
  rt.questionEndsAt = null
  rt.remainingMsWhenPaused = null
  rt.lockedTeams = new Set()
  rt.currentPayload = null
  rt.lastResults = null
  rt.previousRanks = new Map()

  repo.deleteAnswersForGame(gameId)
  repo.resetTeamScores(gameId)
  repo.resetGameForRestart(gameId)

  for (const { peer, meta } of getPeersForGame(gameId)) {
    const state = buildFullSyncState(gameId, meta.playerId ?? null)
    if (state) sendMessage(peer, { type: 'STATE_SYNC', state })
  }

  return repo.getGame(gameId)!
}

// ---------------------------------------------------------------------------
// State sync (initial connect / reconnect)
// ---------------------------------------------------------------------------

export function buildFullSyncState(gameId: string, playerId: string | null): FullSyncState | null {
  if (playerId) {
    const player = repo.getPlayer(playerId)
    const catchupSessionId = player ? catchupEngine.getCatchupSessionIdForPlayer(player) : null
    if (catchupSessionId) {
      return catchupEngine.buildCatchupSyncStateForPlayer(gameId, catchupSessionId, playerId)
    }
  }

  const game = repo.getGame(gameId)
  if (!game) return null
  const teams = repo.listMainTeams(gameId)
  const players = repo.listMainPlayers(gameId)
  const questions = repo.listQuestions(gameId)
  const rt = getRuntime(gameId)

  let self: FullSyncState['self'] = null
  if (playerId) {
    const player = players.find((p) => p.id === playerId) ?? null
    if (player) {
      const team = player.teamId ? teams.find((t) => t.id === player.teamId) ?? null : null
      self = { player, team }
    }
  }

  const myTeamLocked = self?.team ? rt.lockedTeams.has(self.team.id) : false

  return {
    game,
    teams,
    players,
    self,
    totalQuestions: questions.length,
    currentQuestion: game.status === 'QUESTION_ACTIVE' ? rt.currentPayload : null,
    lastResults: game.status === 'QUESTION_RESULTS' ? rt.lastResults : null,
    leaderboard: computeLeaderboard(gameId, rt.previousRanks),
    myAnswerLocked: myTeamLocked,
    myTeamLocked,
    lockedTeamIds: [...rt.lockedTeams],
    bingoCard: null,
    bingoCalledItems: [],
    bingoItemsRemaining: 0
  }
}

export function removeRuntime(gameId: string): void {
  const rt = runtimes.get(gameId)
  if (rt) clearTimers(rt)
  runtimes.delete(gameId)
}
