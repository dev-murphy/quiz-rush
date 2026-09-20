import { requireGameMaster } from '../../../../utils/auth'
import { listBingoItems } from '../../../../utils/repo'

export default defineEventHandler((event) => {
  requireGameMaster(event)
  const gameId = getRouterParam(event, 'id')!
  return listBingoItems(gameId)
})
