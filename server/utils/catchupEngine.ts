import type {
  CatchupSyncPayload,
  FullSyncState,
  Game,
  Player,
  QuestionEndedPayload,
  QuestionStartedPayload,
  TeamQuestionResult
} from '#shared/types'
import { computeLeaderboard } from './leaderboard'
import { evaluateAnswer, getCorrectAnswerDisplay } from './scoring'
import { sanitizeQuestion } from './sanitize'
import * as repo from './repo'
import { broadcastToPlayers, getPeersForGame, sendMessage, sendToPlayer } from './wsRegistry'

/** Fixed pause between a catch-up session's own questions — it runs unattended, so there's no Game Master to configure this. */
const CATCHUP_RESULT_DELAY_MS = 5000

interface CatchupRuntime {
  sessionId: string
  gameId: string
  questionTimer: ReturnType<typeof setTimeout> | null
  resultTimer: ReturnType<typeof setTimeout> | null
  questionStartedAt: number | null
  questionEndsAt: number | null
  lockedTeams: Set<string>
  currentPayload: QuestionStartedPayload | null
  lastResults: QuestionEndedPayload | null
  previousRanks: Map<string, number>
}

const runtimes = new Map<string, CatchupRuntime>()

function getRuntime(sessionId: string, gameId: string): CatchupRuntime {
  let rt = runtimes.get(sessionId)
  if (!rt) {
    rt = {
      sessionId,
      gameId,
      questionTimer: null,
      resultTimer: null,
      questionStartedAt: null,
      questionEndsAt: null,
      lockedTeams: new Set(),
      currentPayload: null,
      lastResults: null,
      previousRanks: new Map()
    }
    runtimes.set(sessionId, rt)
  }
  return rt
}

function clearTimers(rt: CatchupRuntime): void {
  if (rt.questionTimer) clearTimeout(rt.questionTimer)
  if (rt.resultTimer) clearTimeout(rt.resultTimer)
  rt.questionTimer = null
  rt.resultTimer = null
}

function catchupPlayerIds(sessionId: string): Set<string> {
  return new Set(repo.listPlayersForSession(sessionId).map((p) => p.id))
}

function activeTeamIds(sessionId: string): Set<string> {
  const players = repo.listPlayersForSession(sessionId)
  return new Set(players.filter((p) => p.teamId).map((p) => p.teamId as string))
}

function broadcastToSession(sessionId: string, gameId: string, message: Parameters<typeof sendMessage>[1]): void {
  broadcastToPlayers(gameId, catchupPlayerIds(sessionId), message)
}

export function notifyMaster(gameId: string): void {
  const payload = buildCatchupSyncForMaster(gameId)
  for (const { peer, meta } of getPeersForGame(gameId)) {
    if (meta.role === 'master') sendMessage(peer, { type: 'CATCHUP_SYNC', payload })
  }
}

/** Given a player, returns the catch-up session their team belongs to (null if they're a main-session player). */
export function getCatchupSessionIdForPlayer(player: Player): string | null {
  if (!player.teamId) return null
  const team = repo.getTeam(player.teamId)
  return team?.sessionId ?? null
}

export function buildCatchupSyncForMaster(gameId: string): CatchupSyncPayload {
  const session = repo.getActiveCatchupSession(gameId)
  if (!session) {
    return { session: null, teams: [], players: [], totalQuestions: 0, currentQuestion: null, lastResults: null }
  }
  const rt = getRuntime(session.id, gameId)
  const questions = repo.listQuestions(gameId)
  return {
    session,
    teams: repo.listTeamsForSession(session.id),
    players: repo.listPlayersForSession(session.id),
    totalQuestions: questions.length,
    currentQuestion: session.status === 'QUESTION_ACTIVE' ? rt.currentPayload : null,
    lastResults: session.status === 'QUESTION_RESULTS' ? rt.lastResults : null
  }
}

export function startCatchupQuestion(sessionId: string, index: number): void {
  const session = repo.getCatchupSession(sessionId)
  if (!session) return
  const rt = getRuntime(sessionId, session.gameId)
  clearTimers(rt)
  const questions = repo.listQuestions(session.gameId)

  if (index < 0 || index >= questions.length) {
    finishCatchupSession(sessionId)
    return
  }

  const question = questions[index]!
  const now = Date.now()
  const endsAt = now + question.timeLimit * 1000

  repo.setCatchupQuestionIndex(sessionId, index)
  repo.updateCatchupStatus(sessionId, 'QUESTION_ACTIVE')

  rt.questionStartedAt = now
  rt.questionEndsAt = endsAt
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

  broadcastToSession(sessionId, session.gameId, { type: 'QUESTION_STARTED', payload })
  notifyMaster(session.gameId)

  rt.questionTimer = setTimeout(() => endCatchupQuestion(sessionId), question.timeLimit * 1000)
}

/** Starts a LOBBY catch-up session's first question — from here it runs unattended. */
export function beginCatchupSession(sessionId: string): void {
  startCatchupQuestion(sessionId, 0)
}

export function submitCatchupAnswer(sessionId: string, player: Player, questionId: string, answer: unknown): void {
  const session = repo.getCatchupSession(sessionId)
  if (!session) return
  const rt = getRuntime(sessionId, session.gameId)

  if (session.status !== 'QUESTION_ACTIVE') {
    sendToPlayer(session.gameId, player.id, { type: 'ANSWER_ACK', correct: false, locked: false, message: 'Question is not active.' })
    return
  }
  if (!rt.currentPayload || rt.currentPayload.question.id !== questionId) {
    sendToPlayer(session.gameId, player.id, { type: 'ANSWER_ACK', correct: false, locked: false, message: 'That question has ended.' })
    return
  }
  if (Date.now() > (rt.questionEndsAt ?? 0)) {
    sendToPlayer(session.gameId, player.id, { type: 'ANSWER_ACK', correct: false, locked: false, message: 'Time is up.' })
    return
  }
  if (!player.teamId) {
    sendToPlayer(session.gameId, player.id, { type: 'ANSWER_ACK', correct: false, locked: false, message: 'You are not on a team yet.' })
    return
  }
  if (rt.lockedTeams.has(player.teamId)) {
    sendToPlayer(session.gameId, player.id, {
      type: 'ANSWER_ACK',
      correct: true,
      locked: true,
      message: 'Your team already answered this one!'
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

    sendToPlayer(session.gameId, player.id, {
      type: 'ANSWER_ACK',
      correct: true,
      locked: true,
      message: 'Correct!',
      scoreAwarded: score
    })
    broadcastToSession(sessionId, session.gameId, {
      type: 'TEAM_ANSWERED',
      teamId: player.teamId,
      correct: true,
      answeredByName: player.name
    })
    notifyMaster(session.gameId)

    const active = activeTeamIds(sessionId)
    const allLocked = active.size > 0 && [...active].every((t) => rt.lockedTeams.has(t))
    if (allLocked) endCatchupQuestion(sessionId)
  } else {
    sendToPlayer(session.gameId, player.id, { type: 'ANSWER_ACK', correct: false, locked: false, message: 'Not quite — try again!' })
  }
}

export function endCatchupQuestion(sessionId: string): void {
  const session = repo.getCatchupSession(sessionId)
  if (!session) return
  const rt = getRuntime(sessionId, session.gameId)
  clearTimers(rt)
  if (!rt.currentPayload || session.status !== 'QUESTION_ACTIVE') return

  const questions = repo.listQuestions(session.gameId)
  const question = questions.find((q) => q.id === rt.currentPayload!.question.id)
  if (!question) return

  const teams = repo.listTeamsForSession(sessionId)
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

  const leaderboard = computeLeaderboard(session.gameId, rt.previousRanks)
  rt.previousRanks = new Map(leaderboard.map((e) => [e.teamId, e.rank]))

  const isLastQuestion = question.order >= questions.length - 1
  const nextStartsAt = Date.now() + CATCHUP_RESULT_DELAY_MS

  const payload: QuestionEndedPayload = {
    question: rt.currentPayload.question,
    correctAnswer: getCorrectAnswerDisplay(question),
    teamResults,
    leaderboard,
    isLastQuestion,
    nextStartsAt
  }

  rt.lastResults = payload
  repo.updateCatchupStatus(sessionId, 'QUESTION_RESULTS')
  broadcastToSession(sessionId, session.gameId, { type: 'QUESTION_ENDED', payload })
  notifyMaster(session.gameId)

  const currentIndex = questions.findIndex((q) => q.id === question.id)
  rt.resultTimer = setTimeout(() => {
    if (isLastQuestion) {
      finishCatchupSession(sessionId)
    } else {
      startCatchupQuestion(sessionId, currentIndex + 1)
    }
  }, CATCHUP_RESULT_DELAY_MS)
}

export function finishCatchupSession(sessionId: string): void {
  const session = repo.getCatchupSession(sessionId)
  if (!session) return
  const rt = getRuntime(sessionId, session.gameId)
  clearTimers(rt)
  repo.markCatchupSessionFinished(sessionId)
  const leaderboard = computeLeaderboard(session.gameId, rt.previousRanks)
  broadcastToSession(sessionId, session.gameId, { type: 'GAME_FINISHED', leaderboard })
  notifyMaster(session.gameId)
  runtimes.delete(sessionId)
}

/** Ends a catch-up session immediately without playing it out — e.g. the Game Master started one by mistake. */
export function cancelCatchupSession(sessionId: string): void {
  const session = repo.getCatchupSession(sessionId)
  if (!session) return
  const rt = runtimes.get(sessionId)
  if (rt) clearTimers(rt)
  repo.markCatchupSessionFinished(sessionId)
  broadcastToSession(sessionId, session.gameId, { type: 'GAME_CANCELLED', message: 'This catch-up session was cancelled.' })
  notifyMaster(session.gameId)
  runtimes.delete(sessionId)
}

/**
 * Builds a `FullSyncState` for a catch-up player using the SAME shape the main
 * session uses, so the player-facing UI needs no changes: `game.status` is
 * swapped for the catch-up session's own status/question index, teams/players
 * are scoped to just this session's roster, and `leaderboard` stays the
 * game-wide board so their team's score is visible once it counts.
 */
export function buildCatchupSyncStateForPlayer(gameId: string, sessionId: string, playerId: string): FullSyncState | null {
  const game = repo.getGame(gameId)
  const session = repo.getCatchupSession(sessionId)
  if (!game || !session) return null

  const teams = repo.listTeamsForSession(sessionId)
  const players = repo.listPlayersForSession(sessionId)
  const questions = repo.listQuestions(gameId)
  const rt = getRuntime(sessionId, gameId)

  const player = players.find((p) => p.id === playerId) ?? null
  const self = player
    ? { player, team: player.teamId ? teams.find((t) => t.id === player.teamId) ?? null : null }
    : null

  const myTeamLocked = self?.team ? rt.lockedTeams.has(self.team.id) : false

  const syntheticGame: Game = {
    ...game,
    status: session.status,
    currentQuestionIndex: session.currentQuestionIndex,
    paused: false
  }

  return {
    game: syntheticGame,
    teams,
    players,
    self,
    totalQuestions: questions.length,
    currentQuestion: session.status === 'QUESTION_ACTIVE' ? rt.currentPayload : null,
    lastResults: session.status === 'QUESTION_RESULTS' ? rt.lastResults : null,
    leaderboard: computeLeaderboard(gameId, rt.previousRanks),
    myAnswerLocked: myTeamLocked,
    myTeamLocked,
    lockedTeamIds: [...rt.lockedTeams],
    bingoCard: null,
    bingoCalledItems: [],
    bingoItemsRemaining: 0
  }
}

export function removeCatchupRuntime(sessionId: string): void {
  const rt = runtimes.get(sessionId)
  if (rt) clearTimers(rt)
  runtimes.delete(sessionId)
}
