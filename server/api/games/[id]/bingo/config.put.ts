import { requireGameMaster } from '../../../../utils/auth'
import { validateBingoConfigInput } from '../../../../utils/bingoValidation'
import { getGame, updateBingoConfig } from '../../../../utils/repo'

export default defineEventHandler(async (event) => {
  requireGameMaster(event)
  const gameId = getRouterParam(event, 'id')!
  const game = getGame(gameId)
  if (!game) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  if (game.gameType !== 'BINGO') throw createError({ statusCode: 400, statusMessage: 'Not a bingo game' })

  const body = await readBody<{ gridSize?: number; freeSpace?: boolean; winPattern?: string; winPoints?: number }>(event)
  const config = validateBingoConfigInput(body ?? {})
  updateBingoConfig(gameId, config)
  return getGame(gameId)
})
