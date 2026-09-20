import { requireGameMaster } from '../../../utils/auth'
import { restartBingoGame } from '../../../utils/bingoEngine'
import { restartGame } from '../../../utils/gameEngine'
import { getGame } from '../../../utils/repo'

export default defineEventHandler((event) => {
  requireGameMaster(event)
  const gameId = getRouterParam(event, 'id')!
  const game = getGame(gameId)
  if (!game) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  try {
    if (game.gameType === 'BINGO') {
      restartBingoGame(gameId)
      return getGame(gameId)
    }
    return restartGame(gameId)
  } catch (e) {
    throw createError({ statusCode: 400, statusMessage: e instanceof Error ? e.message : 'Could not restart game' })
  }
})
