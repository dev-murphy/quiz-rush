import { requireGameMaster } from '../../../../utils/auth'
import { validateBingoItemTexts } from '../../../../utils/bingoValidation'
import { createBingoItems, getGame } from '../../../../utils/repo'

export default defineEventHandler(async (event) => {
  requireGameMaster(event)
  const gameId = getRouterParam(event, 'id')!
  const game = getGame(gameId)
  if (!game) throw createError({ statusCode: 404, statusMessage: 'Game not found' })

  const body = await readBody<{ texts?: unknown }>(event)
  const texts = validateBingoItemTexts(body?.texts)
  return createBingoItems(gameId, texts)
})
