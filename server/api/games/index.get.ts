import { requireGameMaster } from '../../utils/auth'
import { countBingoItems, listGames, listQuestions } from '../../utils/repo'

export default defineEventHandler((event) => {
  requireGameMaster(event)
  const games = listGames()
  return games.map((game) => ({
    ...game,
    questionCount: listQuestions(game.id).length,
    itemCount: countBingoItems(game.id)
  }))
})
