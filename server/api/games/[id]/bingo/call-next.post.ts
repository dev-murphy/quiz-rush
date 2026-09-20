import { requireGameMaster } from '../../../../utils/auth'
import { callNextBingoItem } from '../../../../utils/bingoEngine'

export default defineEventHandler((event) => {
  requireGameMaster(event)
  const gameId = getRouterParam(event, 'id')!
  try {
    callNextBingoItem(gameId)
    return { ok: true }
  } catch (e) {
    throw createError({ statusCode: 400, statusMessage: e instanceof Error ? e.message : 'Could not call next item' })
  }
})
