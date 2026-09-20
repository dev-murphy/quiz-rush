import { requireGameMaster } from '../../../../utils/auth'
import { endBingoGameEarly, pauseBingoGame, restartBingoGame, resumeBingoGame } from '../../../../utils/bingoEngine'

type ControlAction = 'pause' | 'resume' | 'end' | 'restart'

export default defineEventHandler(async (event) => {
  requireGameMaster(event)
  const gameId = getRouterParam(event, 'id')!
  const body = await readBody<{ action?: ControlAction }>(event)

  try {
    switch (body?.action) {
      case 'pause':
        pauseBingoGame(gameId)
        break
      case 'resume':
        resumeBingoGame(gameId)
        break
      case 'end':
        endBingoGameEarly(gameId)
        break
      case 'restart':
        restartBingoGame(gameId)
        break
      default:
        throw createError({ statusCode: 400, statusMessage: 'Unknown control action' })
    }
  } catch (e) {
    throw createError({ statusCode: 400, statusMessage: e instanceof Error ? e.message : 'Could not perform action' })
  }

  return { ok: true }
})
