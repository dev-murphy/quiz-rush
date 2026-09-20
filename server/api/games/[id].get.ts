import { requireGameMaster } from '../../utils/auth'
import { getGame, listBingoItems, listMainTeams, listPlayers, listQuestions } from '../../utils/repo'

export default defineEventHandler((event) => {
  requireGameMaster(event)
  const id = getRouterParam(event, 'id')!
  const game = getGame(id)
  if (!game) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  return {
    game,
    questions: listQuestions(id),
    bingoItems: listBingoItems(id),
    teams: listMainTeams(id),
    players: listPlayers(id)
  }
})
