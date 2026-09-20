import { requireGameMaster } from '../../../utils/auth'
import { startBingoGame } from '../../../utils/bingoEngine'
import { startGame } from '../../../utils/gameEngine'
import { getGame } from '../../../utils/repo'

export default defineEventHandler((event) => {
  requireGameMaster(event)
  const gameId = getRouterParam(event, 'id')!
  const game = getGame(gameId)
  if (!game) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  try {
    if (game.gameType === 'BINGO') {
      startBingoGame(gameId)
    } else {
      startGame(gameId)
    }
    return { ok: true }
  } catch (e) {
    throw createError({ statusCode: 400, statusMessage: e instanceof Error ? e.message : 'Could not start game' })
  }
})
