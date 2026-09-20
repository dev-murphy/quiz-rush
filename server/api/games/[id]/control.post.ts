import { requireGameMaster } from '../../../utils/auth'
import { advanceToNextQuestion, endGameEarly, pauseGame, restartQuestion, resumeGame, skipQuestion } from '../../../utils/gameEngine'
import { getGame } from '../../../utils/repo'

type ControlAction = 'pause' | 'resume' | 'skip' | 'end' | 'restart' | 'next'

export default defineEventHandler(async (event) => {
  requireGameMaster(event)
  const gameId = getRouterParam(event, 'id')!
  const game = getGame(gameId)
  if (!game) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  if (game.gameType === 'BINGO') {
    throw createError({ statusCode: 400, statusMessage: 'Use /bingo/control for a bingo game' })
  }
  const body = await readBody<{ action?: ControlAction }>(event)

  switch (body?.action) {
    case 'pause':
      pauseGame(gameId)
      break
    case 'resume':
      resumeGame(gameId)
      break
    case 'skip':
      skipQuestion(gameId)
      break
    case 'next':
      advanceToNextQuestion(gameId)
      break
    case 'end':
      endGameEarly(gameId)
      break
    case 'restart':
      restartQuestion(gameId)
      break
    default:
      throw createError({ statusCode: 400, statusMessage: 'Unknown control action' })
  }

  return { ok: true }
})
