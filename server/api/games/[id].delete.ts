import { requireGameMaster } from '../../utils/auth'
import { removeBingoRuntime } from '../../utils/bingoEngine'
import { removeCatchupRuntime } from '../../utils/catchupEngine'
import { removeRuntime } from '../../utils/gameEngine'
import { deleteGame, getActiveCatchupSession, getGame } from '../../utils/repo'

export default defineEventHandler((event) => {
  requireGameMaster(event)
  const id = getRouterParam(event, 'id')!
  const game = getGame(id)
  if (!game) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  removeRuntime(id)
  removeBingoRuntime(id)
  const catchupSession = getActiveCatchupSession(id)
  if (catchupSession) removeCatchupRuntime(catchupSession.id)
  deleteGame(id)
  return { ok: true }
})
