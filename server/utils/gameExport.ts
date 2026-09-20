import { db } from './db'
import { computeLeaderboard } from './leaderboard'
import * as repo from './repo'

export interface GameExport {
  game: ReturnType<typeof repo.getGame>
  questions: ReturnType<typeof repo.listQuestions>
  teams: ReturnType<typeof repo.listTeams>
  players: ReturnType<typeof repo.listPlayers>
  answers: ReturnType<typeof repo.getAnswersForGame>
  leaderboard: ReturnType<typeof computeLeaderboard>
  bingoItems: ReturnType<typeof repo.listBingoItems>
  bingoCards: ReturnType<typeof repo.listBingoCardsForGame>
  bingoCalls: ReturnType<typeof repo.listBingoCalls>
}

/** Builds a full, self-contained export of a single game's data for backup/download. */
export function buildGameExport(gameId: string): GameExport | null {
  const game = repo.getGame(gameId)
  if (!game) return null
  return {
    game,
    questions: repo.listQuestions(gameId),
    teams: repo.listTeams(gameId),
    players: repo.listPlayers(gameId),
    answers: repo.getAnswersForGame(gameId),
    leaderboard: computeLeaderboard(gameId, new Map()),
    bingoItems: repo.listBingoItems(gameId),
    bingoCards: repo.listBingoCardsForGame(gameId),
    bingoCalls: repo.listBingoCalls(gameId)
  }
}

export interface FullExportBundle {
  exportedAt: number
  games: GameExport[]
}

/** Builds a full export bundle across every game on the platform. */
export function buildFullExport(): FullExportBundle {
  const games = repo
    .listGames()
    .map((g) => buildGameExport(g.id))
    .filter((g): g is GameExport => g !== null)
  return { exportedAt: Date.now(), games }
}

export interface ImportResult {
  /** Ids of games newly created from the import. */
  imported: string[]
  /** Ids of games skipped because a game with that id already exists. */
  skipped: string[]
}

/**
 * Restores games from a previously-downloaded full export (see `buildFullExport`).
 * Games are re-created with their original ids so re-running an import is
 * idempotent: any game id that already exists is left untouched and skipped.
 * The whole import is one transaction — either every new game is restored or none are.
 */
export function importFullExport(bundle: FullExportBundle): ImportResult {
  const imported: string[] = []
  const skipped: string[] = []

  const tx = db.transaction((games: GameExport[]) => {
    for (const g of games) {
      if (!g.game) continue
      if (repo.gameIdExists(g.game.id)) {
        skipped.push(g.game.id)
        continue
      }
      const pin = g.game.pin && !repo.pinExists(g.game.pin) ? g.game.pin : null
      repo.restoreGame(g.game, pin)
      if (g.questions.length) repo.restoreQuestions(g.questions)
      if (g.teams.length) repo.restoreTeams(g.teams)
      if (g.players.length) repo.restorePlayers(g.players)
      if (g.answers.length) repo.restoreAnswers(g.answers)
      if (g.bingoItems?.length) repo.restoreBingoItems(g.bingoItems)
      if (g.bingoCards?.length) repo.restoreBingoCards(g.bingoCards)
      if (g.bingoCalls?.length) repo.restoreBingoCalls(g.bingoCalls)
      imported.push(g.game.id)
    }
  })
  tx(bundle.games)

  return { imported, skipped }
}
