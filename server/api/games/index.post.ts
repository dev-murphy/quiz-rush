import type { GameMode, GameType } from '#shared/types'
import { requireGameMaster } from '../../utils/auth'
import { createGame } from '../../utils/repo'

export default defineEventHandler(async (event) => {
  requireGameMaster(event)
  const body = await readBody<{ title?: string; mode?: GameMode; gameType?: GameType }>(event)
  const title = (body?.title ?? '').trim()
  if (!title) throw createError({ statusCode: 400, statusMessage: 'Title is required' })
  const mode: GameMode = body?.mode === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'TEAM'
  const gameType: GameType = body?.gameType === 'BINGO' ? 'BINGO' : 'QUIZ'
  return createGame(title, mode, gameType)
})
