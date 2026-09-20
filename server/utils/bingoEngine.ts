import type { BingoCalledItem, BingoCardCell, BingoWinner, FullSyncState, Player } from '#shared/types'
import { computeLeaderboard } from './leaderboard'
import * as repo from './repo'
import { broadcast, getPeersForGame, sendMessage, sendToPlayer } from './wsRegistry'

const FREE_SENTINEL = 'FREE'

interface RuntimeState {
  gameId: string
  callOrder: string[]
  calledCount: number
}

const runtimes = new Map<string, RuntimeState>()

function getRuntime(gameId: string): RuntimeState {
  let rt = runtimes.get(gameId)
  if (!rt) {
    rt = { gameId, callOrder: [], calledCount: 0 }
    runtimes.set(gameId, rt)
  }
  return rt
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

function cellsNeeded(gridSize: number, freeSpace: boolean): number {
  return gridSize * gridSize - (freeSpace ? 1 : 0)
}

function buildCardCells(
  itemsById: Map<string, string>,
  cellItemIds: string[]
): BingoCardCell[] {
  return cellItemIds.map((itemId) => ({
    itemId,
    text: itemId === FREE_SENTINEL ? 'FREE' : itemsById.get(itemId) ?? '',
    isFree: itemId === FREE_SENTINEL
  }))
}

function calledItemIdsFor(gameId: string): string[] {
  return repo.listBingoCalls(gameId).map((c) => c.itemId)
}

function calledItemsFor(gameId: string, itemsById: Map<string, string>): BingoCalledItem[] {
  return repo.listBingoCalls(gameId).map((c) => ({ itemId: c.itemId, text: itemsById.get(c.itemId) ?? '' }))
}

function markedGrid(cellItemIds: string[], calledItemIds: Set<string>): boolean[] {
  return cellItemIds.map((itemId) => itemId === FREE_SENTINEL || calledItemIds.has(itemId))
}

function hasWinningPattern(marked: boolean[], gridSize: number, pattern: 'LINE' | 'BLACKOUT'): boolean {
  if (pattern === 'BLACKOUT') return marked.every(Boolean)

  for (let row = 0; row < gridSize; row++) {
    let allMarked = true
    for (let col = 0; col < gridSize; col++) {
      if (!marked[row * gridSize + col]) {
        allMarked = false
        break
      }
    }
    if (allMarked) return true
  }
  for (let col = 0; col < gridSize; col++) {
    let allMarked = true
    for (let row = 0; row < gridSize; row++) {
      if (!marked[row * gridSize + col]) {
        allMarked = false
        break
      }
    }
    if (allMarked) return true
  }
  let diag1 = true
  let diag2 = true
  for (let i = 0; i < gridSize; i++) {
    if (!marked[i * gridSize + i]) diag1 = false
    if (!marked[i * gridSize + (gridSize - 1 - i)]) diag2 = false
  }
  return diag1 || diag2
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function startBingoGame(gameId: string): void {
  const game = repo.getGame(gameId)
  if (!game) throw new Error('Game not found')
  if (game.status !== 'LOBBY') throw new Error('Game is not in lobby')
  const config = game.bingoConfig
  if (!config) throw new Error('Bingo game is missing its configuration')

  const items = repo.listBingoItems(gameId)
  const needed = cellsNeeded(config.gridSize, config.freeSpace)
  if (items.length < needed) {
    throw new Error(`Bingo needs at least ${needed} items for a ${config.gridSize}x${config.gridSize} card`)
  }

  const players = repo.listMainPlayers(gameId)
  if (players.length === 0) throw new Error('No players have joined yet')

  const itemsById = new Map(items.map((i) => [i.id, i.text]))
  const centerIndex = config.freeSpace ? Math.floor((config.gridSize * config.gridSize) / 2) : -1

  for (const player of players) {
    const picked = shuffle(items).slice(0, needed).map((i) => i.id)
    const cellItemIds: string[] = []
    let pickIdx = 0
    for (let cell = 0; cell < config.gridSize * config.gridSize; cell++) {
      if (cell === centerIndex) {
        cellItemIds.push(FREE_SENTINEL)
      } else {
        cellItemIds.push(picked[pickIdx]!)
        pickIdx++
      }
    }
    repo.createBingoCard(gameId, player.id, cellItemIds)
    sendToPlayer(gameId, player.id, { type: 'BINGO_CARD_ASSIGNED', cells: buildCardCells(itemsById, cellItemIds) })
  }

  const rt = getRuntime(gameId)
  rt.callOrder = shuffle(items.map((i) => i.id))
  rt.calledCount = 0

  repo.setGameStarted(gameId)
  broadcast(gameId, { type: 'GAME_STARTED', startedAt: Date.now() })
}

/**
 * Rebuilds the in-memory call order from the DB if it was lost (e.g. a dev
 * server reload mid-game): already-called items keep their call order, the
 * remaining pool is reshuffled.
 */
function ensureCallOrder(gameId: string): RuntimeState {
  const rt = getRuntime(gameId)
  if (rt.callOrder.length > 0) return rt

  const items = repo.listBingoItems(gameId)
  const calledSoFar = calledItemIdsFor(gameId)
  const calledSet = new Set(calledSoFar)
  const remaining = shuffle(items.map((i) => i.id).filter((id) => !calledSet.has(id)))
  rt.callOrder = [...calledSoFar, ...remaining]
  rt.calledCount = calledSoFar.length
  return rt
}

export function callNextBingoItem(gameId: string): void {
  const game = repo.getGame(gameId)
  if (!game) throw new Error('Game not found')
  if (game.status !== 'ACTIVE' || game.paused) throw new Error('Bingo game is not active')

  const rt = ensureCallOrder(gameId)
  if (rt.calledCount >= rt.callOrder.length) throw new Error('Every item has already been called')

  const itemId = rt.callOrder[rt.calledCount]!
  rt.calledCount++
  const order = repo.listBingoCalls(gameId).length
  repo.createBingoCall(gameId, itemId, order)

  const items = repo.listBingoItems(gameId)
  const itemsById = new Map(items.map((i) => [i.id, i.text]))
  const item = itemsById.get(itemId)
  broadcast(gameId, {
    type: 'BINGO_ITEM_CALLED',
    itemId,
    text: item ?? '',
    calledItems: calledItemsFor(gameId, itemsById),
    remaining: rt.callOrder.length - rt.calledCount
  })
}

export function claimBingo(gameId: string, player: Player): void {
  const game = repo.getGame(gameId)
  if (!game || game.status !== 'ACTIVE' || game.paused) {
    sendToPlayer(gameId, player.id, { type: 'BINGO_CLAIM_REJECTED', message: 'The game is not active right now.' })
    return
  }
  const config = game.bingoConfig
  const card = repo.getBingoCardForPlayer(player.id)
  if (!config || !card) {
    sendToPlayer(gameId, player.id, { type: 'BINGO_CLAIM_REJECTED', message: "You don't have a card yet." })
    return
  }

  const calledItemIds = new Set(calledItemIdsFor(gameId))
  const marked = markedGrid(card.cellItemIds, calledItemIds)
  const valid = hasWinningPattern(marked, config.gridSize, config.winPattern)

  if (!valid) {
    sendToPlayer(gameId, player.id, { type: 'BINGO_CLAIM_REJECTED', message: 'Not quite — check your card!' })
    return
  }

  if (player.teamId) repo.incrementTeamScore(player.teamId, config.winPoints)
  finishBingoGame(gameId, {
    playerId: player.id,
    playerName: player.name,
    teamId: player.teamId,
    pattern: config.winPattern
  })
}

export function finishBingoGame(gameId: string, winner?: BingoWinner): void {
  repo.setGameFinished(gameId)
  const leaderboard = computeLeaderboard(gameId, new Map())
  broadcast(gameId, { type: 'GAME_FINISHED', leaderboard, winner })
  runtimes.delete(gameId)
}

// ---------------------------------------------------------------------------
// Game Master controls
// ---------------------------------------------------------------------------

export function pauseBingoGame(gameId: string): void {
  const game = repo.getGame(gameId)
  if (!game || game.status !== 'ACTIVE' || game.paused) return
  repo.setGamePaused(gameId, true)
  broadcast(gameId, { type: 'GAME_PAUSED' })
}

export function resumeBingoGame(gameId: string): void {
  const game = repo.getGame(gameId)
  if (!game || game.status !== 'ACTIVE' || !game.paused) return
  repo.setGamePaused(gameId, false)
  broadcast(gameId, { type: 'GAME_RESUMED' })
}

export function endBingoGameEarly(gameId: string): void {
  finishBingoGame(gameId)
}

export function restartBingoGame(gameId: string): void {
  const game = repo.getGame(gameId)
  if (!game) throw new Error('Game not found')
  if (game.status !== 'FINISHED') throw new Error('Only a finished game can be restarted')

  repo.clearBingoRuntimeForRestart(gameId)
  repo.resetTeamScores(gameId)
  repo.resetGameForRestart(gameId)
  runtimes.delete(gameId)

  for (const { peer, meta } of getPeersForGame(gameId)) {
    const state = buildBingoFullSyncState(gameId, meta.playerId ?? null)
    if (state) sendMessage(peer, { type: 'STATE_SYNC', state })
  }
}

// ---------------------------------------------------------------------------
// State sync (initial connect / reconnect)
// ---------------------------------------------------------------------------

export function buildBingoFullSyncState(gameId: string, playerId: string | null): FullSyncState | null {
  const game = repo.getGame(gameId)
  if (!game) return null
  const teams = repo.listMainTeams(gameId)
  const players = repo.listMainPlayers(gameId)
  const items = repo.listBingoItems(gameId)
  const itemsById = new Map(items.map((i) => [i.id, i.text]))

  let self: FullSyncState['self'] = null
  let bingoCard: BingoCardCell[] | null = null
  if (playerId) {
    const player = players.find((p) => p.id === playerId) ?? null
    if (player) {
      const team = player.teamId ? teams.find((t) => t.id === player.teamId) ?? null : null
      self = { player, team }
      const card = repo.getBingoCardForPlayer(playerId)
      if (card) bingoCard = buildCardCells(itemsById, card.cellItemIds)
    }
  }

  const calledItems = calledItemsFor(gameId, itemsById)

  return {
    game,
    teams,
    players,
    self,
    totalQuestions: 0,
    currentQuestion: null,
    lastResults: null,
    leaderboard: computeLeaderboard(gameId, new Map()),
    myAnswerLocked: false,
    myTeamLocked: false,
    lockedTeamIds: [],
    bingoCard,
    bingoCalledItems: calledItems,
    bingoItemsRemaining: Math.max(0, items.length - calledItems.length)
  }
}

export function removeBingoRuntime(gameId: string): void {
  runtimes.delete(gameId)
}
